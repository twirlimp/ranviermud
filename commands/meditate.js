'use strict';
const l10nFile = __dirname + '/../l10n/commands/emote.yml';
const l10n = require('../src/l10n')(l10nFile);
const CommandUtil = require('../src/command_util').CommandUtil;
const util = require('util');

exports.command = (rooms, items, players, npcs, Commands) => {
  return (args, player) => {
    const self = player.getName();

    if (player.isInCombat()) {
      return player.say("You can't do that while fighting.");
    }
    if (player.getEffects('recuperating')) {
      return player.say('You are already recuperating.');
    }

    util.log(self + ' is meditating.');
    player.write('<blue>You rest and regain your focus.</blue>\n');
    player.emit('meditate');
  };
};
