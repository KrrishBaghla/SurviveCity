"""GRPO training pipeline for SurviveCity.

Qwen2.5-3B-Instruct + LoRA + GRPO via Unsloth and TRL.

Usage:
    python -m training.train [--max-steps 4000] [--env-url http://localhost:7860]
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import random

import torch

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("survivecity.train")


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--model-name", default="Qwen/Qwen2.5-3B-Instruct")
    p.add_argument("--env-url", default="http://localhost:7860")
    p.add_argument("--max-steps", type=int, default=4000)
    p.add_argument("--save-steps", type=int, default=500)
    p.add_argument("--lr", type=float, default=1e-5)
    p.add_argument("--num-generations", type=int, default=4)
    p.add_argument("--output-dir", default="./lora_v1")
    p.add_argument("--lora-r", type=int, default=16)
    p.add_argument("--lora-alpha", type=int, default=32)
    p.add_argument("--max-seq-length", type=int, default=4096)
    p.add_argument("--temperature", type=float, default=0.9)
    p.add_argument("--beta", type=float, default=0.04)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--report-to", default="tensorboard")
    # Resume / portability flags — let the same script run on Kaggle and DGX,
    # using HF Hub as a checkpoint bridge between the two.
    p.add_argument(
        "--resume-from-checkpoint", default=None,
        help="Path to a checkpoint dir, or 'auto' to pick the latest under "
             "--output-dir, or a HF Hub repo id (will be downloaded first).")
    p.add_argument(
        "--push-to-hub", action="store_true",
        help="Push every saved checkpoint to the HF Hub repo named by "
             "--hub-model-id. Requires HUGGINGFACE_TOKEN / `huggingface-cli login`.")
    p.add_argument(
        "--hub-model-id", default=None,
        help="HF Hub repo id, e.g. 'KrrishBaghla/SurviveCity-qwen-grpo-lora'. "
             "Created if it does not exist.")
    p.add_argument(
        "--hub-private", action="store_true",
        help="Create the hub repo as private (default: public).")
    p.add_argument(
        "--save-total-limit", type=int, default=3,
        help="Keep at most this many checkpoints on disk (older ones deleted).")
    return p.parse_args()


def build_scenario_dataset(num_scenarios=200, seed=42):
    """Build a dataset of scenario prompts using the LOCAL env (no HTTP).

    Each prompt embeds the episode seed as [SEED:N] so the reward function
    can recreate the exact same env state for fair GRPO comparison.
    """
    from datasets import Dataset
    from survivecity_env.env import SurviveCityEnv
    from survivecity_env.prompts import build_system_prompt

    rng = random.Random(seed)
    prompts = []
    for i in range(num_scenarios):
        try:
            ep_seed = rng.randint(0, 999999)
            env = SurviveCityEnv()
            obs = env.reset(seed=ep_seed)
            desc = obs.get("description", "")
            # Embed seed so reward_fn can recreate the same env state.
            # GRPO compares completions within a group — same seed = fair comparison.
            prompt = build_system_prompt(0, f"[SEED:{ep_seed}]\n{desc}")
            prompts.append({"prompt": prompt, "scenario_id": i})
        except Exception as e:
            logger.warning(f"Scenario {i} failed: {e}")
    logger.info(f"Built {len(prompts)} scenario prompts")
    return Dataset.from_list(prompts)


# Valid action types for the env
_VALID_ACTIONS = frozenset({
    "move_up", "move_down", "move_left", "move_right",
    "eat", "wait", "vote_lockout", "broadcast",
})
_RANDOM_ACTIONS = ["move_up", "move_down", "move_left", "move_right", "eat", "wait"]


def _parse_action(text: str, agent_id: int = 0):
    """Parse a JSON action from model output. Returns dict or None."""
    text = text.strip()
    # Handle markdown code blocks: ```json ... ```
    if text.startswith("```"):
        parts = text.split("```")
        if len(parts) >= 2:
            text = parts[1].removeprefix("json").strip()
    # Find the first valid JSON object in the text
    for start in range(len(text)):
        if text[start] == '{':
            for end in range(len(text), start, -1):
                if text[end - 1] == '}':
                    try:
                        d = json.loads(text[start:end])
                        d["agent_id"] = agent_id
                        if d.get("action_type") in _VALID_ACTIONS:
                            return d
                    except (json.JSONDecodeError, TypeError):
                        continue
    return None


def create_reward_fn(env_url=None):
    """Create the GRPO reward function using LOCAL env instances.

    Fixes over the original HTTP-based version:
      1. Each completion gets its own SurviveCityEnv (no singleton corruption).
      2. The env is reset with the SAME seed embedded in the prompt, so all
         GRPO completions for the same prompt see the same scenario.
      3. After the model's action, the episode is completed with random
         actions so the reward captures downstream effects (not just +0.005).
      4. Action JSON is validated before submission.
    """
    import re
    from survivecity_env.env import SurviveCityEnv

    def reward_fn(prompts, completions, **kwargs):
        rewards = []
        for prompt, completion in zip(prompts, completions):
            try:
                # Extract seed from the prompt for deterministic env replay
                seed_match = re.search(r'\[SEED:(\d+)\]', prompt)
                ep_seed = int(seed_match.group(1)) if seed_match else (
                    hash(prompt) % 1_000_000)

                # Create a FRESH env — no shared state between completions
                env = SurviveCityEnv()
                obs = env.reset(seed=ep_seed)

                # Parse the model's action for agent 0
                action = _parse_action(completion, agent_id=0)
                if action is None:
                    rewards.append(0.01)  # malformed output = min reward
                    continue

                # Execute the model's action
                obs = env.step(action)

                # Complete the episode with random actions so the reward
                # reflects the downstream impact of the model's decision.
                # Use a seeded RNG for reproducibility within the same call.
                rollout_rng = random.Random(ep_seed + 7)
                steps = 0
                while not obs.get("done", False) and steps < 350:
                    aid = obs.get("metadata", {}).get("current_agent_id", 0)
                    sc = obs.get("step_count", 0)
                    if sc == 50:
                        rand_act = {"agent_id": aid, "action_type": "vote_lockout",
                                    "vote_target": rollout_rng.choice([0, 1, 2])}
                    else:
                        rand_act = {"agent_id": aid,
                                    "action_type": rollout_rng.choice(_RANDOM_ACTIONS)}
                    obs = env.step(rand_act)
                    steps += 1

                rewards.append(obs.get("reward", 0.01))
            except Exception as e:
                logger.debug(f"reward_fn error: {e}")
                rewards.append(0.01)
        return rewards

    return reward_fn


def main():
    args = parse_args()
    random.seed(args.seed)
    torch.manual_seed(args.seed)

    # Reduce CUDA memory fragmentation on shared GPUs.
    os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

    # Detect mixed-precision capability of the visible GPU.
    # Ampere+ (compute capability >= 8.0): bf16. Earlier (V100/Turing): fp16.
    # DGX-1 / DGX-2 boxes ship with V100 (Volta, cc 7.0) and have NO native bf16.
    #
    # IMPORTANT: torch.cuda.is_bf16_supported() defaults to
    # including_emulation=True since torch 2.4, so it returns True even on V100
    # (where bf16 is silently emulated on CPU). transformers'
    # is_torch_bf16_gpu_available() does the strict compute-capability check
    # and returns False — so passing bf16=True trips the TrainingArguments
    # validator. We must mirror the strict check here.
    cuda_ok = torch.cuda.is_available()
    cap = torch.cuda.get_device_capability(0) if cuda_ok else (0, 0)
    cuda_major = int(torch.version.cuda.split(".")[0]) if torch.version.cuda else 0
    use_bf16 = cuda_ok and cap[0] >= 8 and cuda_major >= 11
    use_fp16 = cuda_ok and not use_bf16
    compute_dtype = torch.bfloat16 if use_bf16 else torch.float16
    if cuda_ok:
        logger.info(
            f"GPU={torch.cuda.get_device_name(0)} cc={cap[0]}.{cap[1]} "
            f"cuda={torch.version.cuda} bf16={use_bf16} fp16={use_fp16}"
        )
    else:
        logger.warning("CUDA not available — training will fall back to CPU.")

    # Force the entire model onto the single visible GPU. With --gpus '"device=N"',
    # the container sees exactly one device (cuda:0). accelerate's auto device-map
    # planner can otherwise underestimate available memory and dispatch some
    # modules to CPU/disk, which trips bnb's validate_environment with
    #   ValueError: Some modules are dispatched on the CPU or the disk.
    # Qwen2.5-3B-4bit is ~2 GB; a V100-32GB has plenty of room.
    device_map = {"": 0} if cuda_ok else "cpu"

    # Unsloth needs Ampere+ (sm_80) for its fast kernels, and unsloth_zoo's
    # temporary_patches assumes torch._inductor.config is auto-imported (true
    # in torch 2.5+, false in 2.4). On Pascal/Volta or older torch, skip
    # straight to the transformers+peft path. UNSLOTH_DISABLE=1 forces it.
    disable_unsloth = (
        os.environ.get("UNSLOTH_DISABLE", "").lower() in {"1", "true", "yes"}
        or (cuda_ok and cap[0] < 8)
    )
    unsloth_loaded = False
    if not disable_unsloth:
        try:
            # Eagerly import the submodule unsloth_zoo touches via inspect — in
            # torch 2.4 `import torch` doesn't pull in torch._inductor.config.
            # Use importlib so we don't create a local `torch` binding in this
            # function (Python treats `import torch.X` as `torch = ...` at compile
            # time, which shadows the module-level torch everywhere in main()).
            import importlib
            importlib.import_module("torch._inductor.config")
            from unsloth import FastLanguageModel
            model, tokenizer = FastLanguageModel.from_pretrained(
                args.model_name,
                load_in_4bit=True,
                max_seq_length=args.max_seq_length,
                dtype=compute_dtype,
                device_map=device_map,
            )
            model = FastLanguageModel.get_peft_model(
                model, r=args.lora_r,
                target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
                lora_alpha=args.lora_alpha, lora_dropout=0.0, bias="none",
                use_gradient_checkpointing="unsloth")
            unsloth_loaded = True
        except Exception as e:
            logger.warning(f"Unsloth load failed ({type(e).__name__}: {e}); "
                           "falling back to transformers + peft.")
    if not unsloth_loaded:
        from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
        from peft import get_peft_model, LoraConfig, prepare_model_for_kbit_training
        tokenizer = AutoTokenizer.from_pretrained(args.model_name)
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_compute_dtype=compute_dtype,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
        ) if cuda_ok else None
        model = AutoModelForCausalLM.from_pretrained(
            args.model_name,
            torch_dtype=compute_dtype,
            device_map=device_map,
            quantization_config=bnb_config,
        )
        if bnb_config is not None:
            model = prepare_model_for_kbit_training(model)
        model = get_peft_model(model, LoraConfig(
            r=args.lora_r, lora_alpha=args.lora_alpha,
            target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
            lora_dropout=0.0, bias="none", task_type="CAUSAL_LM"))

    if cuda_ok:
        free_b, total_b = torch.cuda.mem_get_info(0)
        logger.info(
            f"GPU memory after load: free={free_b/1e9:.2f}GB total={total_b/1e9:.2f}GB"
        )

    # Make sure the tokenizer has a pad token (Qwen2.5 doesn't ship one).
    if tokenizer.pad_token_id is None:
        if tokenizer.eos_token_id is not None:
            tokenizer.pad_token = tokenizer.eos_token
        else:
            tokenizer.add_special_tokens({"pad_token": "<|PAD_TOKEN|>"})
            model.resize_token_embeddings(len(tokenizer))

    dataset = build_scenario_dataset(200, args.seed)

    from trl import GRPOTrainer, GRPOConfig

    # Hub push lets Kaggle and DGX share checkpoints. We push after every save
    # so a crashed/timed-out Kaggle session is recoverable from DGX (and vice
    # versa). hub_model_id can be None when --push-to-hub is False.
    push_to_hub = bool(args.push_to_hub and args.hub_model_id)
    if args.push_to_hub and not args.hub_model_id:
        logger.warning("--push-to-hub set without --hub-model-id; disabling hub push.")

    # Auto-detect available VRAM and adjust generation count if the GPU is
    # heavily shared. GRPO peak memory scales roughly as
    #   num_generations × (prompt_len + completion_len) × model_params.
    num_gen = args.num_generations
    grad_accum = 16
    max_prompt_len = 512
    max_compl_len = 256
    if cuda_ok:
        free_gb = torch.cuda.mem_get_info(0)[0] / 1e9
        logger.info(f"Free VRAM before trainer init: {free_gb:.2f} GB")
        if free_gb < 6:
            num_gen = min(num_gen, 2)
            max_compl_len = 128
            logger.warning(f"Very low VRAM ({free_gb:.1f} GB) — reducing to "
                           f"num_gen={num_gen}, max_compl_len={max_compl_len}")
        elif free_gb < 12:
            num_gen = min(num_gen, 4)
            logger.info(f"Moderate VRAM ({free_gb:.1f} GB) — capping num_gen={num_gen}")

    config = GRPOConfig(
        output_dir=args.output_dir, num_generations=num_gen,
        per_device_train_batch_size=1, gradient_accumulation_steps=grad_accum,
        learning_rate=args.lr, max_steps=args.max_steps,
        save_steps=args.save_steps, logging_steps=10,
        save_total_limit=args.save_total_limit,
        max_prompt_length=max_prompt_len, max_completion_length=max_compl_len,
        temperature=args.temperature, beta=args.beta,
        bf16=use_bf16, fp16=use_fp16,
        bf16_full_eval=use_bf16, fp16_full_eval=use_fp16,
        tf32=use_bf16,  # TF32 is also Ampere+ only
        report_to=args.report_to if args.report_to != "none" else None,
        push_to_hub=push_to_hub,
        hub_model_id=args.hub_model_id if push_to_hub else None,
        hub_private_repo=args.hub_private,
        hub_strategy="every_save" if push_to_hub else "end",
        seed=args.seed)
    logger.info(
        f"GRPOConfig precision: bf16={config.bf16} fp16={config.fp16} "
        f"bf16_full_eval={config.bf16_full_eval} fp16_full_eval={config.fp16_full_eval} "
        f"tf32={config.tf32}"
    )

    # TRL >= 0.15 GRPOTrainer.__init__ does
    #   model.warnings_issued["estimate_tokens"] = True
    # `warnings_issued` is a dict normally set by transformers.PreTrainedModel
    # __init__, but the unsloth fast-load path bypasses that init step, and
    # PEFT's __getattr__ delegation chain (PeftModel -> LoraModel ->
    # Qwen2ForCausalLM) then raises AttributeError. Seed the attribute on
    # every wrapper in the chain so the trainer's lookup succeeds regardless
    # of which level it lands on.
    def _seed_warnings_issued(m, depth=0):
        if m is None or depth > 6:
            return
        try:
            if not isinstance(getattr(m, "warnings_issued", None), dict):
                m.warnings_issued = {}
        except Exception:
            pass
        for attr in ("base_model", "model"):
            inner = getattr(m, attr, None)
            if inner is not None and inner is not m:
                _seed_warnings_issued(inner, depth + 1)

    _seed_warnings_issued(model)

    trainer = GRPOTrainer(
        model=model, args=config,
        reward_funcs=[create_reward_fn(args.env_url)],  # env_url kept for compat but local env used
        train_dataset=dataset, processing_class=tokenizer)

    # Resolve --resume-from-checkpoint:
    #   None / ""        -> no resume (fresh training)
    #   "auto"           -> let HF Trainer find the latest checkpoint-* dir
    #                       under output_dir
    #   <local path>     -> resume from that path
    #   <hf repo id>     -> snapshot_download from the Hub, then resume
    resume = _resolve_resume(args.resume_from_checkpoint, args.output_dir)
    if resume is not None:
        logger.info(f"Resuming from checkpoint: {resume}")

    try:
        trainer.train(resume_from_checkpoint=resume)
    except KeyboardInterrupt:
        logger.warning("Interrupted — saving checkpoint before exit.")
        trainer.save_model(args.output_dir)
        raise

    trainer.save_model(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)
    if push_to_hub:
        logger.info(f"Pushing final model to hub: {args.hub_model_id}")
        trainer.push_to_hub(commit_message="final model")
    logger.info(f"Saved to {args.output_dir}")


def _resolve_resume(spec, output_dir):
    """Turn --resume-from-checkpoint into something Trainer.train accepts."""
    import os
    if not spec:
        return None
    if spec == "auto":
        # Trainer.train accepts True to mean "find latest checkpoint in output_dir".
        # But only if output_dir actually contains one — otherwise it errors.
        if os.path.isdir(output_dir) and any(
            d.startswith("checkpoint-") for d in os.listdir(output_dir)
        ):
            return True
        logger.info(f"No checkpoint-* dir under {output_dir}; starting fresh.")
        return None
    if os.path.isdir(spec):
        return spec
    # Treat as HF Hub repo id, e.g. "user/zombiee-qwen-grpo-lora"
    if "/" in spec and not spec.startswith("./") and not spec.startswith("/"):
        try:
            from huggingface_hub import snapshot_download
        except ImportError:
            raise RuntimeError(
                "huggingface_hub required to resume from a Hub repo; "
                "pip install huggingface_hub"
            )
        local = snapshot_download(repo_id=spec, local_dir=os.path.join(output_dir, "_resume"))
        logger.info(f"Downloaded {spec} -> {local}")
        return local
    return spec  # let Trainer surface the error if the path is bad


if __name__ == "__main__":
    main()
