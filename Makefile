.PHONY: build
build:
	mkdir -p build
	cat src/t3_css.txt src/t3_html.txt src/t3_b.js src/t3_c.js src/t3_d.js > build/template.html
	python3 -I scripts/build.py
	node --check build/app.js
