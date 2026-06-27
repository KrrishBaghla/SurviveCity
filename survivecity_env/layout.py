"""Fixed grid layout constants for SurviveCity v1.

10×10 grid with:
  - Safehouse (S): 3×3 block at rows 4-6, cols 4-6
  - Food depots (F): four corners — (1,1), (1,8), (8,1), (8,8)
  - Walls (#): scattered chokepoints (~8 walls)
  - Everything else: empty (.)
"""

GRID_ROWS = 10
GRID_COLS = 10

# Safehouse cells — 3×3 block in center
SAFEHOUSE_CELLS: set[tuple[int, int]] = {
    (r, c) for r in range(4, 7) for c in range(4, 7)
}

# Food depot positions (corners)
FOOD_CELLS: set[tuple[int, int]] = {
    (1, 1), (1, 8), (8, 1), (8, 8),
}

# Wall positions — chokepoints around the safehouse approaches
WALL_CELLS: set[tuple[int, int]] = {
    (3, 3), (3, 6),   # north of safehouse
    (7, 3), (7, 6),   # south of safehouse
    (2, 5), (5, 2),   # left approach choke
    (5, 7), (7, 5),   # right approach choke
}

# Agent spawn positions (inside safehouse)
AGENT_SPAWNS: list[tuple[int, int]] = [
    (4, 4),  # A0
    (4, 5),  # A1
    (5, 4),  # A2
]

# Zombie spawn positions (corners of the grid)
ZOMBIE_SPAWNS: list[tuple[int, int]] = [
    (0, 0),  # Z0
    (0, 9),  # Z1
    (9, 9),  # Z2
]


def build_grid() -> list[list[str]]:
    """Build the initial 10×10 grid with cell-type markers.

    Returns a 2D list where:
      '.' = empty
      '#' = wall
      'F' = food depot
      'S' = safehouse
    Agents and zombies are rendered on top of this base grid.
    """
    grid = [["." for _ in range(GRID_COLS)] for _ in range(GRID_ROWS)]

    for r, c in WALL_CELLS:
        grid[r][c] = "#"

    for r, c in FOOD_CELLS:
        grid[r][c] = "F"

    for r, c in SAFEHOUSE_CELLS:
        grid[r][c] = "S"

    return grid


def render_grid(
    base_grid: list[list[str]],
    agents: list[dict],
    zombies: list[dict],
) -> list[list[str]]:
    """Render agents and zombies onto a copy of the base grid.

    agents/zombies should have 'row', 'col', and optionally 'agent_id'/'zombie_id'.
    """
    import copy
    grid = copy.deepcopy(base_grid)

    for z in zombies:
        r, c = z["row"], z["col"]
        grid[r][c] = "Z"

    for a in agents:
        if a.get("is_alive", True):
            r, c = a["row"], a["col"]
            grid[r][c] = f"A{a['agent_id']}"

    return grid
