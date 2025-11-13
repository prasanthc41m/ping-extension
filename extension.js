import St from 'gi://St';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'Ping Indicator');

        // Configuration
        this.SETTINGS_FILE_PATH = GLib.build_filenamev([
            GLib.get_user_config_dir(),
            'ping',
            'settings.json',
        ]);
        this.domainToPing = 'google.com'; // Default target
        this.soundEnabled = true;
        this.timeoutId = null;
        this.lastStatus = null;

        // Load settings
        this._loadSettings();

        // UI Elements
        this._label = new St.Label({ text: 'Pinging...', y_align: Clutter.ActorAlign.CENTER });
        this.add_child(this._label);

        // Domain/IP Input
        this._entry = new St.Entry({
            hint_text: 'Enter domain or IP',
            track_hover: true,
            can_focus: true,
        });
        this._entry.clutter_text.connect('activate', () => {
            this.domainToPing = this._entry.get_text();
            this._saveSettings();
            this.menu.close();
        });
        const entryItem = new PopupMenu.PopupMenuItem('');
        entryItem.actor.add_child(this._entry);
        this.menu.addMenuItem(entryItem);

        // Sound Toggle
        this._soundToggle = new PopupMenu.PopupSwitchMenuItem('Enable Sound', this.soundEnabled);
        this._soundToggle.connect('toggled', (item) => {
            this.soundEnabled = item.state;
            this._saveSettings();
        });
        this.menu.addMenuItem(this._soundToggle);

        // Start the recurring ping check
        this._startPingLoop();
    }

    _startPingLoop() {
        // Clear any existing timeout
        if (this.timeoutId) {
            GLib.Source.remove(this.timeoutId);
            this.timeoutId = null;
        }

        // Create a recurring ping check every 1 second
        this.timeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            1,
            () => this._checkPing()
        );
    }

    async _checkPing() {
        try {
            const output = await this._executePingCommand();
            const currentStatus = this._parsePingOutput(output);
            this._updateUI(currentStatus);
            this._handleSound(currentStatus);
            this.lastStatus = currentStatus;
        } catch (e) {
            this._updateUI('No response');
            this._handleSound('No response');
            this.lastStatus = 'No response';
        }
        return GLib.SOURCE_CONTINUE; // Keep the timer running
    }

    async _executePingCommand() {
        return new Promise((resolve, reject) => {
            const proc = new Gio.Subprocess({
                argv: ['ping', '-c', '1', '-O', this.domainToPing],
                flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
            });
            proc.init(null);

            proc.communicate_utf8_async(null, null, (proc, res) => {
                try {
                    const [ok, stdout, stderr] = proc.communicate_utf8_finish(res);
                    if (!ok) reject(new Error(stderr.trim()));
                    else resolve(stdout.trim());
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    _parsePingOutput(output) {
        const match = /time=([\d.]+)/.exec(output);
        return match ? `${Math.round(parseFloat(match[1]))} ms` : 'No response';
    }

    _updateUI(status) {
        this._label.set_text(status);
    }

    _handleSound(currentStatus) {
        if (!this.soundEnabled || !this._isStatusChangeSignificant(currentStatus)) return;

        const player = global.display.get_sound_player();
        if (!player) {
            console.error('Sound player unavailable');
            return;
        }

        const soundFile = this._getSoundFile(currentStatus);
        if (soundFile.query_exists(null)) {
            player.play_from_file(soundFile, 'Ping Alert', null);
        }
    }

    _isStatusChangeSignificant(currentStatus) {
        const wasSuccess = this.lastStatus?.endsWith(' ms');
        const isSuccess = currentStatus.endsWith(' ms');
        return wasSuccess !== isSuccess;
    }

    _getSoundFile(status) {
        const basePath = `${GLib.get_home_dir()}/.local/share/gnome-shell/extensions/ping@prasanthc41m.github.com/audio/`;
        const fileName = status.endsWith(' ms') ? 'ping_started.ogg' : 'no_response.ogg';
        return Gio.File.new_for_path(`${basePath}${fileName}`);
    }

    _loadSettings() {
        try {
            const file = Gio.File.new_for_path(this.SETTINGS_FILE_PATH);
            if (file.query_exists(null)) {
                const [success, contents] = file.load_contents(null);
                if (success) {
                    const settings = JSON.parse(new TextDecoder('utf-8').decode(contents));
                    this.soundEnabled = settings.soundEnabled ?? this.soundEnabled;
                    this.domainToPing = settings.domainToPing ?? this.domainToPing;
                }
            }
        } catch (e) {
            console.error(`Settings load error: ${e}`);
        }
    }

    _saveSettings() {
        try {
            const dir = GLib.path_get_dirname(this.SETTINGS_FILE_PATH);
            GLib.mkdir_with_parents(dir, 0o755);

            const settings = {
                soundEnabled: this.soundEnabled,
                domainToPing: this.domainToPing,
            };
            const file = Gio.File.new_for_path(this.SETTINGS_FILE_PATH);
            file.replace_contents(
                JSON.stringify(settings, null, 2),
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );
        } catch (e) {
            console.error(`Settings save error: ${e}`);
        }
    }

    destroy() {
        if (this.timeoutId) {
            GLib.Source.remove(this.timeoutId);
            this.timeoutId = null;
        }
        super.destroy();
    }
});

export default class PingExtension {
    enable() {
        this.indicator = new Indicator();
        Main.panel.addToStatusArea('ping-indicator', this.indicator);
    }

    disable() {
        if (this.indicator) {
            this.indicator.destroy();
            this.indicator = null;
        }
    }
}
