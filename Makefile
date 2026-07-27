.PHONY: ntd help

# Capture everything after 'ntd' as the title, prevent make treating them as targets
ifeq ($(firstword $(MAKECMDGOALS)), ntd)
  ARGS := $(wordlist 2, $(words $(MAKECMDGOALS)), $(MAKECMDGOALS))
  $(foreach w, $(ARGS), $(eval $(w):;@:))
endif

# Create a new todo file: make ntd 将发送按钮嵌入到输入框中
# Result: Todo/21_将发送.md
ntd:
ifeq ($(strip $(ARGS)),)
	$(error Usage: make ntd your todo title)
endif
	@powershell -NoProfile -ExecutionPolicy Bypass -File scripts/ntd.ps1 -Title "$(ARGS)"

help:
	@echo.
	@echo   ntd ^<title^>   Create a new numbered todo file
	@echo.
	@echo   Example:
	@echo     make ntd 将发送按钮嵌入到输入框中
	@echo     ^> Creates: Todo/21_将发送.md
	@echo.
