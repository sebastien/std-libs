
SOURCES_JS=$(wildcard src/js/*.js src/js/*/*.js)
SOURCES_SJS=$(wildcard src/sjs/*.sjs src/sjs/*/*.sjs src/sjs/*/*/*.sjs src/sjs/*/*/*/*.sjs)
SOURCES_PCSS=$(wildcard src/pcss/*.pcss)
SOURCES_PAMLXSL=$(wildcard src/xsl/*.paml)

DIST_JS=$(SOURCES_JS:src/js/%.js=dist/js/%.js)
DIST_SJS=$(SOURCES_SJS:src/sjs/%.sjs=dist/js/%.js)
DIST_PCSS=$(SOURCES_PCSS:src/pcss/%.pcss=dist/css/%.css)
DIST_XSL=$(SOURCES_PAMLXSL:src/xsl/%.xsl.paml=dist/xsl/%.xsl)
DIST_ALL=$(DIST_SJS) $(DIST_JS) $(DIST_PCSS) $(DIST_XSL)

PAML=paml
PCSS=pcss
SUGAR2=sugar2

all: $(DIST_ALL)
	$(info Built $(DIST_ALL))

release: all
	rsync -avz dist/ developer@ffctn.com:/data/www/ffctn.com/a/std-libs/
	tar cvfJ dist.tar.bz2 dist
	scp dist.tar.bz2 developer@ffctn.com:/data/www/ffctn.com/a/std-libs/

dist/%.xsl: src/%.xsl.paml
	@mkdir -p $(shell dirname "$@"); true
	@$(PAML) "$<" > "$@"

dist/css/%.css: src/pcss/%.pcss
	@mkdir -p $(shell dirname "$@"); true
	@$(PCSS) "$<" > "$@"

dist/js/%.js: src/sjs/%.sjs
	@mkdir -p $(shell dirname "$@"); true
	@$(SUGAR2) -cles -Lsrc/sjs -Dumd "$<" -o "$@"

dist/%.js: src/%.js
	@mkdir -p $(shell dirname "$@"); true
	@cp -a "$<" "$@"

.PHONY: push


# EOF
