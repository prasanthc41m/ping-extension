all: clean build

PLUGIN_LOCATION = ~/.local/share/gnome-shell/extensions/ping@prasanthc41m.github.com

build:
	zip ping-extension.zip extension.js LICENSE metadata.json 

install:
	mkdir -p $(PLUGIN_LOCATION)
	cp -R extension.js metadata.json $(PLUGIN_LOCATION)
	echo 'Plugin installed. Restart GNOME Shell.'

uninstall:
	rm -rf $(PLUGIN_LOCATION)

reinstall: uninstall install

clean:
	rm -f *.zip
