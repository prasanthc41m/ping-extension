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
      this.SETTINGS_FILE_PATH = GLib.build_filenamev([GLib.get_user_config_dir(), 'ping', 'settings.json']);
      this.domainToPing = 'google.com';
      this.soundEnabled = true;
      this.panelPosition = 'right';   // 'left', 'center', 'right'
      this.panelOrder = 0;
      this.timeoutId = null;
      this.lastStatus = null;

      // Load saved settings
      this._loadSettings();

      // Label
      this._label = new St.Label({ text: 'Pinging...', y_align: Clutter.ActorAlign.CENTER });
      this.add_child(this._label);

      // Domain Input
      this._entry = new St.Entry({
        hint_text: 'Enter domain or IP',
        track_hover: true,
        can_focus: true,
      });
      this._entry.set_text(this.domainToPing);
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

      // Panel Position Section
      const positionSection = new PopupMenu.PopupMenuSection();
      const positionLabel = new St.Label({ text: 'Panel Position:', style: 'padding: 4px;' });
      positionSection.actor.add_child(positionLabel);

      const positionBox = new St.BoxLayout({ style: 'spacing: 8px; padding: 4px;' });

      this._leftButton = new St.Button({ label: 'Left', style: 'padding: 4px 8px;' });
      this._leftButton.connect('clicked', () => {
        this.panelPosition = 'left';
        this._saveSettings();
        this._updateButtonStyles();
        this._updatePosition();
        this.menu.close();
      });

      this._centerButton = new St.Button({ label: 'Center', style: 'padding: 4px 8px;' });
      this._centerButton.connect('clicked', () => {
        this.panelPosition = 'center';
        this._saveSettings();
        this._updateButtonStyles();
        this._updatePosition();
        this.menu.close();
      });

      this._rightButton = new St.Button({ label: 'Right', style: 'padding: 4px 8px;' });
      this._rightButton.connect('clicked', () => {
        this.panelPosition = 'right';
        this._saveSettings();
        this._updateButtonStyles();
        this._updatePosition();
        this.menu.close();
      });

      positionBox.add_child(this._leftButton);
      positionBox.add_child(this._centerButton);
      positionBox.add_child(this._rightButton);
      positionSection.actor.add_child(positionBox);
      this.menu.addMenuItem(positionSection);

      this._updateButtonStyles();

      // Panel Order Section
      const orderSection = new PopupMenu.PopupMenuSection();
      const orderLabel = new St.Label({ text: 'Panel Order:', style: 'padding: 4px;' });
      orderSection.actor.add_child(orderLabel);

      const orderBox = new St.BoxLayout({ style: 'spacing: 8px; padding: 4px;' });

      const minusButton = new St.Button({ label: '-', style: 'padding: 4px 12px;' });
      minusButton.connect('clicked', () => {
        this.panelOrder = Math.max(0, this.panelOrder - 1);
        this._orderInput.set_text(this.panelOrder.toString());
        this._saveSettings();
        this._updatePosition();
      });

      this._orderInput = new St.Entry({
        text: this.panelOrder.toString(),
                                      style: 'width: 60px;',
                                      can_focus: true,
      });
      this._orderInput.clutter_text.connect('activate', () => {
        const value = parseInt(this._orderInput.get_text()) || 0;
        this.panelOrder = Math.max(0, value);
        this._orderInput.set_text(this.panelOrder.toString());
        this._saveSettings();
        this._updatePosition();
      });

      const plusButton = new St.Button({ label: '+', style: 'padding: 4px 12px;' });
      plusButton.connect('clicked', () => {
        this.panelOrder += 1;
        this._orderInput.set_text(this.panelOrder.toString());
        this._saveSettings();
        this._updatePosition();
      });

      orderBox.add_child(minusButton);
      orderBox.add_child(this._orderInput);
      orderBox.add_child(plusButton);
      orderSection.actor.add_child(orderBox);
      this.menu.addMenuItem(orderSection);

      // Start ping loop
      this._startPingLoop();
    }

    _addIndicatorToPanel() {
      if (this.get_parent()) {
        this.get_parent().remove_child(this);
      }

      // Which panel box?
      let targetBox;
      switch (this.panelPosition) {
        case 'center':
          targetBox = Main.panel._centerBox;
          break;
        case 'right':
          targetBox = Main.panel._rightBox;
          break;
        case 'left':
        default:
          targetBox = Main.panel._leftBox;
          break;
      }

      const order = Math.max(0, this.panelOrder || 0);
      const children = targetBox.get_children();
      const insertIndex = Math.min(order, children.length);

      targetBox.insert_child_at_index(this, insertIndex);
    }

    _updateButtonStyles() {
      const inactive = 'padding: 4px 8px;';
      const active = 'padding: 4px 8px; border: 1px solid rgba(255,255,255,0.5); border-radius: 4px;';

      this._leftButton.set_style(inactive);
      this._centerButton.set_style(inactive);
      this._rightButton.set_style(inactive);

      if (this.panelPosition === 'left') this._leftButton.set_style(active);
      if (this.panelPosition === 'center') this._centerButton.set_style(active);
      if (this.panelPosition === 'right') this._rightButton.set_style(active);
    }

    _updatePosition() {
      this._addIndicatorToPanel();
    }

    _startPingLoop() {
      if (this.timeoutId) {
        GLib.Source.remove(this.timeoutId);
        this.timeoutId = null;
      }
      this.timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => this._checkPing());
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
      return GLib.SOURCE_CONTINUE;
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
      if (!this.soundEnabled || !this._isStatusChangeSignificant(currentStatus))
        return;

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
            this.panelPosition = settings.panelPosition ?? this.panelPosition;
            this.panelOrder = settings.panelOrder ?? this.panelOrder;
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
          panelPosition: this.panelPosition,
          panelOrder: this.panelOrder,
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
    this.indicator._addIndicatorToPanel();
  }

  disable() {
    if (this.indicator) {
      this.indicator.destroy();
      this.indicator = null;
    }
  }
}
