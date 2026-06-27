# SurviveCity v1 report — build helpers.
#
# Usage:
#   make pdf      # full build with bibliography
#   make quick    # single pdflatex pass (no biblio refresh)
#   make clean    # delete intermediate files
#   make watch    # rebuild on every save (needs latexmk)
#
# Requires a working TeX Live install (texlive-full on Ubuntu, MacTeX on Mac,
# or upload v1.tex + refs.bib to Overleaf and let it build).

NAME = v1

.PHONY: pdf quick clean watch

pdf:
	pdflatex -interaction=nonstopmode $(NAME).tex
	bibtex $(NAME) || true
	pdflatex -interaction=nonstopmode $(NAME).tex
	pdflatex -interaction=nonstopmode $(NAME).tex
	@echo
	@echo "Built $(NAME).pdf"

quick:
	pdflatex -interaction=nonstopmode $(NAME).tex

watch:
	latexmk -pdf -pvc -interaction=nonstopmode $(NAME).tex

clean:
	rm -f $(NAME).aux $(NAME).bbl $(NAME).blg $(NAME).log $(NAME).out \
	      $(NAME).toc $(NAME).fls $(NAME).fdb_latexmk $(NAME).synctex.gz
	@echo "Cleaned intermediates (PDF kept)"
