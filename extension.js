import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import GLib from 'gi://GLib';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';

let domainToPing = 'google.com'; // Change this to the domain or IP address you want to ping
let timeoutId = null;
let soundEnabled = true; // Default sound setting
let lastStatus = null; // Track the last status to detect changes

const Indicator = GObject.registerClass(
    class Indicator extends PanelMenu.Button {
        _init() {
            super._init(0.0, 'My Indicator');
            this._label = new St.Label({
                text: '',
                y_align: Clutter.ActorAlign.CENTER
            });
            this.add_child(this._label);

            // Add entry for domain/IP input
            this._entryItem = new PopupMenu.PopupMenuItem('');
            this._entryItem.actor.reactive = false;
            this._entryItem.actor.can_focus = false;
            this._entry = new St.Entry({
                hint_text: 'Enter domain or IP address',
                track_hover: true,
                can_focus: true
            });
            this._entry.clutter_text.connect('activate', () => {
                domainToPing = this._entry.get_text();
                this.menu.close();
            });
            this._entryItem.add_child(this._entry);
            this.menu.addMenuItem(this._entryItem);

            // Add toggle for sound
            this._soundToggle = new PopupMenu.PopupSwitchMenuItem('Enable Sound', soundEnabled);
            this._soundToggle.connect('toggled', (item) => {
                soundEnabled = item.state;
            });
            this.menu.addMenuItem(this._soundToggle);

            this.checkPingAsync();
        }

        async checkPingAsync() {
            while (true) {
                try {
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
                    let match = /time=([\d.]+)/.exec(out);
                    let currentStatus = match ? `${Math.round(parseFloat(match[1]))} ms` : 'No response';

                    // Update label
                    this._label.set_text(currentStatus);

                    // Check for state changes between "ms" and "No response"
                    if (soundEnabled && this.isStatusChangeSignificant(lastStatus, currentStatus)) {
                        this.playSound();
                    }

                    // Update last status
                    lastStatus = currentStatus;

                } catch (e) {
                    let currentStatus = 'No response';
                    this._label.set_text(currentStatus);

                    // Check for state changes between "ms" and "No response"
                    if (soundEnabled && this.isStatusChangeSignificant(lastStatus, currentStatus)) {
                        this.playSound();
                    }

                    // Update last status
                    lastStatus = currentStatus;
                }
                await new Promise(resolve => timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, resolve));
            }
        }

        isStatusChangeSignificant(previousStatus, currentStatus) {
            // Check if the state changes between "ms" and "No response"
            const isPreviousSuccess = previousStatus && previousStatus.endsWith(' ms');
            const isCurrentSuccess = currentStatus && currentStatus.endsWith(' ms');
            return isPreviousSuccess !== isCurrentSuccess;
        }

        playSound() {
            // Play a sound file (replace with the path to your sound file)
            let soundFile = Gio.File.new_for_path('/usr/share/sounds/gnome/default/alerts/click.ogg');
            if (soundFile.query_exists(null)) {
                let player = new Gio.Subprocess({
                    argv: ['paplay', soundFile.get_path()],
                    flags: Gio.SubprocessFlags.NONE,
                });
                player.init(null);
            } else {
                log('Sound file not found: ' + soundFile.get_path());
            }
        }
    }
);

let indicator;

export default class PingExtension {

    enable() {
        indicator = new Indicator();
        Main.panel.addToStatusArea('indicator', indicator);
    }

    disable() {
        if (timeoutId) {
            GLib.Source.remove(timeoutId);
            timeoutId = null;
        }
        indicator.destroy();
        indicator = null; // Set indicator to null
    }
}
