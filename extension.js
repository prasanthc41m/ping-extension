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

const Indicator = GObject.registerClass(
    class Indicator extends PanelMenu.Button {
        _init() {
            super._init(0.0, 'My Indicator');
            this._label = new St.Label({
                text: '',
                y_align: Clutter.ActorAlign.CENTER
            });
            this.add_child(this._label);
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
            this.checkPingAsync();
        }

        async checkPingAsync() {
            while (true) {
                try {
                    let out = await new Promise((resolve, reject) => {
                        let proc = new Gio.Subprocess({
                            argv: ['ping', '-c', '1', domainToPing],
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
                    if (match) {
                        let time = Math.round(parseFloat(match[1]));
                        this._label.set_text(`${time} ms`);
                    } else {
                        this._label.set_text('No response');
                    }
                } catch (e) {
                    this._label.set_text('No response');
                }
                await new Promise(resolve => timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, resolve));
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
