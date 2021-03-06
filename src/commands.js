'use strict';
const util = require('util'),
  ansi = require('sty').parse,
  fs = require('fs'),
  CommandUtil = require('./command_util').CommandUtil,
  l10nHelper = require('./l10n');

const Doors = require('./doors').Doors;
const _ = require('./helpers');

// "Globals" to be specified later during config.
let rooms = null;
let players = null;
let items = null;
let npcs = null;

/**
 * Localization
 */
let l10n = null;
const l10nFile = __dirname + '/../l10n/commands.yml';

// shortcut for l10n.translate
let L = null;

const commands_dir = __dirname + '/../commands/';

/**
 * Commands a player can execute go here
 * Each command takes two arguments: a _string_ which is everything the user
 * typed after the command itself, and then the player that typed it.
 */
const Commands = {
  player_commands: {},

  //TODO: Extract into individual files.
  admin_commands: {
    addSkill: (rooms, items, players, npcs, Commands) =>
      (player, args) => {
        const Skills = require('./skills').Skills;
        args = _.splitArgs(args);

        const skill = Skills[args[0]] ? Skills[args[0]].id : null;
        const number = args[1] || 1;
        if (skill) {
          player.addSkill(skill, number);
          player.say("<red>ADMIN: Added " + args + ".</red>");
        } else { player.say("<red>ADMIN: No such skill.</red>"); }
        util.log("@@Admin: " + player.getName() + " added skill:", skill);
      },

    addFeat: (rooms, items, players, npcs, Commands) =>
      (player, args) => {
        const Feats = require('./feats').Feats;
        args = _.splitArgs(args);

        const feat = Feats[args[0]] ? Feats[args[0]] : null;

        if (feat) {
          player.gainFeat(feat);
          player.say("<red>ADMIN: Added " + feat.id + ".</red>");
        } else {
          return player.say("<red>ADMIN: No such feat.</red>");
        }
        util.log("@@Admin: " + player.getName() + " added feat:", feat.name);
      },

    teleport: (rooms, items, players, npcs, Commands) =>
      (player, args) => {
        const vnum = parseInt(args, 10);
        if (isNaN(vnum)) {
          return player.say("<red>ADMIN: Invalid vnum.</red>");
        }

        if (rooms.getAt(vnum)) {
          player.setLocation(vnum);
          player.say("<red>ADMIN: You have teleported.");
          return Commands.player_commands.look(null, player);
        }

        player.say("<red>ADMIN: 404: Room not found.</red>");

      },
    //TODO: boostAttr
    //TODO: invis
  },


  /**
   * Configure the commands by using a joint players/rooms array
   * and loading the l10n. The config object should look similar to
   * {
   *   rooms: instanceOfRoomsHere,
   *   players: instanceOfPlayerManager,
   *   locale: 'en'
   * }
   * @param object config
   */
  configure: function(config) {
    rooms   = config.rooms;
    players = config.players;
    items   = config.items;
    npcs    = config.npcs;

    util.log("Loading command l10n... ");
    l10n = l10nHelper(l10nFile);
    l10n.setLocale(config.locale);
    util.log("Done");

    /**
     * Hijack translate to also do coloring
     * @param string text
     * @param ...
     * @return string
     */
    L = text => {
      return ansi(l10n.translate.apply(null, [].slice.call(arguments)));
    };


    // Load external commands
    fs.readdir(commands_dir,
      (err, files) => {
        for (const j in files) {
          const command_file = commands_dir + files[j];
          if (!fs.statSync(command_file).isFile()) { continue; }
          if (!command_file.match(/js$/)) { continue; }

          const command_name = files[j].split('.')[0];

          Commands.player_commands[command_name] = require(command_file)
            .command(rooms, items, players, npcs, Commands);
        }
      });

      //TODO: Do the same way as above once you extract the admin commands.
      for (const command in Commands.admin_commands) {
        const commandFunc = Commands.admin_commands[command](rooms, items, players, npcs, Commands);
        Commands.admin_commands[command] = commandFunc;
      }
  },

  /**
   * Command wasn't an actual command so scan for exits in the room
   * that have the same name as the command typed. Skills will likely
   * follow the same structure
   * @param string exit direction they tried to go
   * @param Player player
   * @return boolean
   */
  room_exits: (exit, player) => {

    const room = rooms.getAt(player.getLocation());
    if (!room) {
      return false;
    }

    const exits = room.getExits()
      .filter( e => {
        let regex;
        try {
          regex = new RegExp("^" + exit);
        } catch (err) {
          util.log(player.getName() + ' entered bogus command: ', exit);
          return false;
        }
        return e.direction.match(regex);
      });

    if (!exits.length) {
      return false;
    }

    if (exits.length > 1) {
      player.sayL10n(l10n, "AMBIG_EXIT");
      return true;
    }

    if (player.isInCombat()) {
      player.sayL10n(l10n, 'MOVE_COMBAT');
      return;
    }

    move(exits.pop(), player);

    return true;
  },

  move: move,

  setLocale: locale => l10n.setLocale(locale),
};

/*
 * Best be settin' aliases here, yo.
 */

alias('exp', 'tnl');
alias('take', 'get');
alias('consider', 'appraise');
alias('me', 'emote');


exports.Commands = Commands;

/**
 * Move helper method
 * @param object exit See the Room class for details
 * @param Player player
 * @returns bool Moved (false if the move fails)
 */
function move(exit, player) {

  rooms
    .getAt(player.getLocation())
    .emit('playerLeave', player, players);

  const closedDoor = !Doors.isOpen(exit);
  const lockedDoor = Doors.isLocked(exit);

  if (closedDoor && lockedDoor) {
    const key = exit.door.key;

    if (!CommandUtil.findItemInInventory(key, player)) {
      const getExitTitle = exitLoc => locale => rooms
          .getAt(exitLoc)
          .getTitle(locale);

      const getDestinationTitle = getExitTitle(exit.location);
      const roomTitle = getDestinationTitle(player.getLocale());

      player.sayL10n(l10n, 'LOCKED', roomTitle);
      players.eachIf(
        p => CommandUtil.inSameRoom(player, p),
        p => {
          let roomTitle = getDestinationTitle(p.getLocale());
          p.sayL10n(l10n, 'OTHER_LOCKED', player.getName(), roomTitle);
        });
      return false;
    }

    Doors.unlockDoor(exit);

    player.sayL10n(l10n, 'UNLOCKED', key);
    players.eachIf(
      p => CommandUtil.inSameRoom(player, p),
      p => p.sayL10n(l10n, 'OTHER_UNLOCKED', player.getName(), key));
  }

  const room = rooms.getAt(exit.location);
  if (!room) {
    player.sayL10n(l10n, 'LIMBO');
    return true;
  }

  const moveCost = exit.cost ? exit.cost : 1;
  if (!player.hasEnergy(moveCost)) { return player.noEnergy(); }

  if (closedDoor) {
    Commands.player_commands.open(exit.direction, player);
  }

  // Send the room leave message
  players.eachExcept(
    player,
    p => {
      if (CommandUtil.inSameRoom(p, player)) {
        try {
          const exitLeaveMessage = exit.leave_message[p.getLocale()];
          const leaveMessage = exitLeaveMessage ?
            player.getName() + exitLeaveMessage :
            player.getName() + ' leaves.';
          p.say(leaveMessage);
        } catch (e) {
          p.sayL10n(l10n, 'LEAVE', player.getName());
          util.log(e);
        }
        p.prompt();
      }
    });



  player.setLocation(exit.location);

  // Add room to list of explored rooms
  const hasExplored = player.explore(room.getLocation());

  // Force a re-look of the room
  Commands.player_commands.look(null, player, hasExplored);

  // Trigger the playerEnter event
  // See example in scripts/npcs/1.js
  room.getNpcs()
      .forEach(id => {
        const npc = npcs.get(id);
        if (!npc) { return; }
        npc.emit('playerEnter', room, rooms, player, players, npc, npcs);
      });

  room.emit('playerEnter', player, players);

  // Broadcast player entrance to new room.
  players.eachExcept(
    player,
    p => {
      if (CommandUtil.inSameRoom(p, player)) {
        p.say(player.getName() + ' enters.');
      }
  });

  return true;

}

/**
 * Alias commands
 * @param string name   Name of the alias E.g., l for look
 * @param string target name of the command
 */
function alias(name, target) {
  Commands.player_commands[name] = function() {
    Commands.player_commands[target].apply(null, [].slice.call(arguments))
  }
}
