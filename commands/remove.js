'use strict';
const util = require('util');

const CommandUtil = require('../src/command_util').CommandUtil;
const l10nFile = __dirname + '/../l10n/commands/remove.yml';
const l10n = require('../src/l10n')(l10nFile);
const _ = require('../src/helpers');

exports.command = (rooms, items, players, npcs, Commands) => {
  return (args, player, isDead) => {

    const target = _.firstWord(args);

    if (target === 'all') { return removeAll(); }

    const thing = CommandUtil.findItemInEquipment(target, player, true);

    return remove(thing);

    /// Helper functions ///

    function removeAll() {
      _.values(player.getEquipped())
       .map(id => items.get(id))
       .forEach(remove);
    }

    function remove(item) {
      if (!item && isDead) {
        return player.sayL10n(l10n, 'ITEM_NOT_FOUND');
      }

      util.log(player.getName() + ' removing ' + item.getShortDesc('en'));

      player.unequip(item);

      if (isDead) { return; }
      if (CommandUtil.hasScript(item, 'remove')) { return item.emit('remove', player); }
      return player.sayL10n(l10n, 'REMOVED', item.getShortDesc(player.getLocale()));
    }
  };
};
