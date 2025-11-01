# SuperGrok-CLI v2.0 Documentation Build System
# Generates professional documentation in multiple formats

.PHONY: all clean diagrams html pdf check-deps install-deps

# Default target
all: diagrams html

# Check for required dependencies
check-deps:
	@echo "Checking dependencies..."
	@which node > /dev/null || (echo "ERROR: Node.js not found" && exit 1)
	@echo "✓ Node.js found"
	@which pandoc > /dev/null || echo "⚠ Pandoc not found (optional for PDF generation)"
	@which plantuml > /dev/null || echo "⚠ PlantUML not found (optional for .puml rendering)"

# Install dependencies
install-deps:
	@echo "Installing documentation dependencies..."
	npm install -g @mermaid-js/mermaid-cli || echo "⚠ Failed to install Mermaid CLI"

# Generate all diagram outputs
diagrams: diagrams-mermaid diagrams-plantuml

# Render Mermaid diagrams to SVG
diagrams-mermaid:
	@echo "Rendering Mermaid diagrams..."
	@cd diagrams && \
	for file in *.mmd; do \
		if [ -f "$$file" ]; then \
			echo "  Rendering $$file..."; \
			mmdc -i "$$file" -o "$${file%.mmd}.svg" -b transparent 2>/dev/null || \
			echo "    ⚠ Mermaid CLI not available, skipping $$file"; \
		fi \
	done

# Render PlantUML diagrams to SVG
diagrams-plantuml:
	@echo "Rendering PlantUML diagrams..."
	@cd diagrams && \
	for file in *.puml; do \
		if [ -f "$$file" ]; then \
			echo "  Rendering $$file..."; \
			plantuml -tsvg "$$file" 2>/dev/null || \
			echo "    ⚠ PlantUML not available, skipping $$file"; \
		fi \
	done

# Generate HTML documentation
html:
	@echo "Generating HTML documentation..."
	@mkdir -p output/html
	@echo "  Converting ROADMAP_V2.0_PROFESSIONAL.md..."
	@pandoc ROADMAP_V2.0_PROFESSIONAL.md \
		--from markdown \
		--to html5 \
		--standalone \
		--self-contained \
		--toc \
		--toc-depth=3 \
		--css=styles.css \
		--metadata title="SuperGrok-CLI v2.0 Roadmap" \
		--output output/html/roadmap.html 2>/dev/null || \
		echo "  ⚠ Pandoc not available, skipping HTML generation"

	@echo "  Converting V2_EXECUTIVE_SUMMARY_PROFESSIONAL.md..."
	@pandoc V2_EXECUTIVE_SUMMARY_PROFESSIONAL.md \
		--from markdown \
		--to html5 \
		--standalone \
		--self-contained \
		--toc \
		--metadata title="SuperGrok-CLI v2.0 Executive Summary" \
		--output output/html/executive-summary.html 2>/dev/null || \
		echo "  ⚠ Pandoc not available, skipping HTML generation"

# Generate PDF documentation (requires pandoc and LaTeX)
pdf:
	@echo "Generating PDF documentation..."
	@mkdir -p output/pdf
	@echo "  Converting ROADMAP_V2.0_PROFESSIONAL.md..."
	@pandoc ROADMAP_V2.0_PROFESSIONAL.md \
		--from markdown \
		--to pdf \
		--toc \
		--toc-depth=3 \
		--metadata title="SuperGrok-CLI v2.0 Roadmap" \
		--metadata author="SuperGrok Team" \
		--metadata date="`date +%Y-%m-%d`" \
		--pdf-engine=xelatex \
		--output output/pdf/roadmap.pdf 2>/dev/null || \
		echo "  ⚠ PDF generation requires pandoc and LaTeX"

	@echo "  Converting V2_EXECUTIVE_SUMMARY_PROFESSIONAL.md..."
	@pandoc V2_EXECUTIVE_SUMMARY_PROFESSIONAL.md \
		--from markdown \
		--to pdf \
		--toc \
		--metadata title="SuperGrok-CLI v2.0 Executive Summary" \
		--metadata author="SuperGrok Team" \
		--metadata date="`date +%Y-%m-%d`" \
		--pdf-engine=xelatex \
		--output output/pdf/executive-summary.pdf 2>/dev/null || \
		echo "  ⚠ PDF generation requires pandoc and LaTeX"

# Clean generated files
clean:
	@echo "Cleaning generated files..."
	@rm -rf output/
	@cd diagrams && rm -f *.svg *.png
	@echo "✓ Clean complete"

# Help target
help:
	@echo "SuperGrok-CLI Documentation Build System"
	@echo ""
	@echo "Available targets:"
	@echo "  make all            - Generate diagrams and HTML (default)"
	@echo "  make diagrams       - Render all diagrams to SVG"
	@echo "  make html           - Generate HTML documentation"
	@echo "  make pdf            - Generate PDF documentation"
	@echo "  make check-deps     - Check for required dependencies"
	@echo "  make install-deps   - Install documentation dependencies"
	@echo "  make clean          - Remove generated files"
	@echo "  make help           - Show this help message"
	@echo ""
	@echo "Requirements:"
	@echo "  - Node.js (required)"
	@echo "  - @mermaid-js/mermaid-cli (for Mermaid diagrams)"
	@echo "  - PlantUML (for PlantUML diagrams)"
	@echo "  - Pandoc (for HTML/PDF generation)"
	@echo "  - XeLaTeX (for PDF generation)"
