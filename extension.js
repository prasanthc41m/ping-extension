import St from 'gi://St';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

// Define the path to the settings file in the user's home directory
const SETTINGS_FILE_PATH = GLib.build_filenamev([
    GLib.get_user_config_dir(),
    'ping-extension',
    'settings.json',
]);

let domainToPing = 'google.com'; // Domain or IP address to ping
let timeoutId = null;
let lastStatus = null; // Track the last status to detect changes

const Indicator = GObject.registerClass(
    class Indicator extends PanelMenu.Button {
        _init() {
            super._init(0.0, 'Ping Indicator');

            // Load settings from file
            this._loadSettings();

            // Create a label to display the ping result
            this._label = new St.Label({
                text: '',
                y_align: Clutter.ActorAlign.CENTER,
            });
            this.add_child(this._label);

            // Add entry for domain/IP input
            this._entryItem = new PopupMenu.PopupMenuItem('');
            this._entryItem.actor.reactive = false;
            this._entryItem.actor.can_focus = false;

            this._entry = new St.Entry({
                hint_text: 'Enter domain or IP address',
                track_hover: true,
                can_focus: true,
            });

            // Update domainToPing when the user presses Enter
            this._entry.clutter_text.connect('activate', () => {
                domainToPing = this._entry.get_text();
                // Optionally save the domain to settings
                this._saveSettings();
                this.menu.close();
            });

            this._entryItem.add_child(this._entry);
            this.menu.addMenuItem(this._entryItem);

            // Add toggle for sound
            this._soundToggle = new PopupMenu.PopupSwitchMenuItem('Enable Sound', this.soundEnabled);
            this._soundToggle.connect('toggled', (item) => {
                this.soundEnabled = item.state;
                // Save the new state to file
                this._saveSettings();
            });
            this.menu.addMenuItem(this._soundToggle);

            // Start the ping monitoring loop
            this.checkPingAsync();
        }

        async checkPingAsync() {
            while (true) {
                try {
                    // Execute the ping command
                    let out = await new Promise((resolve, reject) => {
                        let proc = new Gio.Subprocess({
                            argv: ['ping', '-c', '1', '-W', '2', domainToPing],
                            flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
                        });
                        proc.init(null);

                        proc.communicate_utf8_async(null, null, (proc, res) => {
                            try {
                                let [ok, stdout, stderr] = proc.communicate_utf8_finish(res);
                                if (!ok) {
                                    reject(new Error(stderr.trim()));
                                } else {
                                    resolve(stdout.trim());
                                }
                            } catch (e) {
                                reject(e);
                            }
                        });
                    });

                    // Parse the ping output
                    let match = /time=([\d.]+)/.exec(out);
                    let currentStatus = match ? `${Math.round(parseFloat(match[1]))} ms` : 'No response';

                    // Update the label with the current status
                    this._label.set_text(currentStatus);

                    // Check for state changes between "ms" and "No response"
                    if (this.soundEnabled && this.isStatusChangeSignificant(lastStatus, currentStatus)) {
                        this.playSound(currentStatus);
                    }

                    // Update the last status
                    lastStatus = currentStatus;
                } catch (e) {
                    // Handle errors (e.g., no response)
                    let currentStatus = 'No response';
                    this._label.set_text(currentStatus);

                    // Check for state changes between "ms" and "No response"
                    if (this.soundEnabled && this.isStatusChangeSignificant(lastStatus, currentStatus)) {
                        this.playSound(currentStatus);
                    }

                    // Update the last status
                    lastStatus = currentStatus;
                }

                // Wait for 1 second before the next ping
                await new Promise((resolve) => {
                    timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, resolve);
                });
            }
        }

        isStatusChangeSignificant(previousStatus, currentStatus) {
            // Check if the state changes between "ms" and "No response"
            const isPreviousSuccess = previousStatus && previousStatus.endsWith(' ms');
            const isCurrentSuccess = currentStatus && currentStatus.endsWith(' ms');
            return isPreviousSuccess !== isCurrentSuccess;
        }

        playSound(currentStatus) {
            // Get the sound player
            let player = global.display.get_sound_player();
            if (!player) {
                console.error('Sound player not available');
                return;
            }

            // Construct the path to the sound files
            const HomePath = GLib.get_home_dir();
            const ExtensionPath = `${HomePath}/.local/share/gnome-shell/extensions/ping@prasanthc41m.github.com/audio/`;
            const soundFilePath = currentStatus.endsWith(' ms')
                ? `${ExtensionPath}ping_started.ogg`
                : `${ExtensionPath}no_response.ogg`;

            // Play the sound file
            let soundFile = Gio.File.new_for_path(soundFilePath);
            if (soundFile.query_exists(null)) {
                player.play_from_file(soundFile, 'Ping Alert', null);
            } else {
                console.error(`Sound file not found: ${soundFilePath}`);
            }
        }

        _loadSettings() {
            // Set default values
            this.soundEnabled = true;
            // Optionally, you can also load a default domainToPing
            // domainToPing = 'google.com';

            try {
                // Ensure the settings file exists
                let file = Gio.File.new_for_path(SETTINGS_FILE_PATH);
                if (file.query_exists(null)) {
                    let [success, contents] = file.load_contents(null);
                    if (success) {
                        let settingsString = (new TextDecoder('utf-8')).decode(contents);
                        let settingsData = JSON.parse(settingsString);

                        // Load soundEnabled state
                        if (typeof settingsData.soundEnabled === 'boolean') {
                            this.soundEnabled = settingsData.soundEnabled;
                        }

                        // Optionally load domainToPing
                        if (typeof settingsData.domainToPing === 'string') {
                            domainToPing = settingsData.domainToPing;
                        }
                    }
                }
            } catch (e) {
                log(`Error loading settings: ${e}`);
            }
        }

        _saveSettings() {
            try {
                // Ensure the directory exists
                let dirPath = GLib.path_get_dirname(SETTINGS_FILE_PATH);
                GLib.mkdir_with_parents(dirPath, 0o755);

                let settingsData = {
                    soundEnabled: this.soundEnabled,
                    domainToPing: domainToPing,
                };
                let settingsString = JSON.stringify(settingsData, null, 2);

                // Write settings to file
                let file = Gio.File.new_for_path(SETTINGS_FILE_PATH);
                let flags = Gio.FileCreateFlags.REPLACE_DESTINATION;
                file.replace_contents(
                    settingsString,
                    null,
                    false,
                    flags,
                    null
                );
            } catch (e) {
                log(`Error saving settings: ${e}`);
            }
        }
    }
);

let indicator;

export default class PingExtension {
    enable() {
        // Create and add the indicator to the panel
        indicator = new Indicator();
        Main.panel.addToStatusArea('indicator', indicator);
    }

    disable() {
        // Clean up resources
        if (timeoutId) {
            GLib.Source.remove(timeoutId);
            timeoutId = null;
        }

        // Destroy the indicator
        if (indicator) {
            indicator.destroy();
            indicator = null;
        }
    }
}
