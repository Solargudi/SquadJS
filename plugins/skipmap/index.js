import { CHAT_MESSAGE, NEW_GAME } from 'squad-server/events';
import { COPYRIGHT_MESSAGE } from 'core/constants';

export default {
  name: 'skipmap',
  description:
    'The <code>skipmap</code> plugin will allow players to vote via <code>+</code>/<code>-</code> if they wish to skip the current map',

  defaultEnabled: false,
  optionsSpec: {
    command: {
      required: false,
      description: 'The name of the command to be used in chat.',
      default: '!skipmap'
    },

    voteDuration: {
      required: false,
      description: 'How long the vote should go on for.',
      default: 5 * 60 * 1000
    },

    startTimer: {
      required: false,
      description: 'Time before voting is allowed.',
      default: 15 * 60 * 1000
    },

    endTimer: {
      required: false,
      description: 'Time before voting is no longer allowed.',
      default: 30 * 60 * 1000
    },

    pastVoteTimer: {
      required: false,
      description: 'Time that needs to have passed since the last vote.',
      default: 10 * 60 * 1000
    },

    minimumVotes: {
      required: false,
      description: 'The minimum required amount of votes for the vote to go through',
      default: 20
    },

    reminderInterval: {
      required: false,
      description: 'The time between individual reminders.',
      default: 2 * 60 * 1000
    }
  },

  init: (server, options) => {
    let voteActive;
    let votePos = 0;
    let voteNeg = 0;
    let playerVotes = {};
    let intervalReminderBroadcasts;
    let timeoutVote;
    let timeLastVote = null;

    server.on(CHAT_MESSAGE, async (info) => {
      // check if message is command
      if (!info.message.startsWith(options.command)) return;

      if (voteActive) {
        await server.rcon.warn(info.steamID, 'Голосование уже запущено.');
        return;
      }

      // check if enough time has passed since start of round and if not, inform the player
      if (
        server.layerHistory.length > 0 &&
        server.layerHistory[0].time > Date.now() - options.startTimer
      ) {
        const seconds = Math.floor(
          (server.layerHistory[0].time + options.startTimer - Date.now()) / 1000
        );
        const minutes = Math.floor(seconds / 60);

        await server.rcon.warn(
          info.steamID,
          `Недостаточно времени прошло с начала матча. Повторите команду позже. ${
            minutes ? `${minutes}min` : ''
          } ${seconds ? `${seconds - minutes * 60}s` : ''}`
        );
        return;
      }

      // check if enough time remains in the round, if not, inform player
      if (
        server.layerHistory.length > 0 &&
        server.layerHistory[0].time < Date.now() - options.endTimer
      ) {
        await server.rcon.warn(info.steamID, 'Невозможно запустить голосование, так как матч идёт продолжительное время.');
        return;
      }

      // check if enough time has passed since the last vote
      if (timeLastVote && timeLastVote > Date.now() - options.pastVoteTimer) {
        await server.rcon.warn(info.steamID, 'Прошло недостаточно времени с момента прошлого голосования.');
        return;
      }

      await server.rcon.warn(info.steamID, 'Вы запустили голосование за пропуск карты.');
      await server.rcon.warn(info.steamID, COPYRIGHT_MESSAGE);
      await server.rcon.broadcast(
        'Начато голосование за пропуск карты. Напишите в чат "+" за смену карты, и "-", если вы против.'
      );

      // Actual vote
      voteActive = true;
      votePos = 1;
      voteNeg = 0;
      playerVotes = {};
      playerVotes[info.steamID] = '+';

      // Set reminders
      intervalReminderBroadcasts = setInterval(async () => {
        await server.rcon.broadcast(
          'Начато голосование за пропуск карты. Напишите в чат "+" за смену карты, и "-", если вы против.'
        );
        await server.rcon.broadcast(
          `На данный момент голосов за:${votePos}, против:${voteNeg}.`
        );
      }, options.reminderInterval);

      // End vote
      // Disable recording of new votes, stop further broadcasts
      timeoutVote = setTimeout(() => {
        voteActive = false;
        clearInterval(intervalReminderBroadcasts);
        // Check if enough people voted
        if (voteNeg + votePos < options.minVoteCount) {
          server.rcon.broadcast('Not enough people voted for the vote to go through.');
          return;
        }
        if (votePos > voteNeg) {
          server.rcon.broadcast(
            `Начато голосование за пропуск карты. За - ${votePos}, против - ${voteNeg}.`
          );
          server.rcon.execute('AdminEndMatch');
        } else {
          server.rcon.broadcast(
            `Недостаточное количество человек проголосовало за пропуск карты.За - ${votePos}, против - ${voteNeg}.`
          );
        }
        // As a vote happened, stop any further votes from happening until enough time has passed
        timeLastVote = new Date();
      }, options.voteDuration);
    });

    // Clear timeouts and intervals when new game starts
    server.on(NEW_GAME, () => {
      clearInterval(intervalReminderBroadcasts);
      clearTimeout(timeoutVote);
      voteActive = false;
      timeLastVote = null;
    });

    // Record votes
    server.on(CHAT_MESSAGE, async (info) => {
      if (!voteActive) return;
      if (!['+', '-'].includes(info.message)) return;

      // Check if player has voted previously, if yes, remove their vote
      if (playerVotes[info.steamID]) {
        if (playerVotes[info.steamID] === '+') votePos--;
        else voteNeg--;
      }

      // Record player vote
      if (info.message === '+') {
        votePos++;
        await server.rcon.warn(info.steamID, 'Вы проголосовали за');
      } else if (info.message === '-') {
        voteNeg++;
        await server.rcon.warn(info.steamID, 'Вы проголосовали против');
      }

      await server.rcon.warn(info.steamID, COPYRIGHT_MESSAGE);

      playerVotes[info.steamID] = info.message;

      // If 50 people voted in favour, instantly win the vote
      if (votePos >= 50) {
        await server.rcon.broadcast(
          `Начато голосование за пропуск карты. За - ${votePos}, против - ${voteNeg}.`
        );
        await server.rcon.execute('AdminEndMatch');
        timeLastVote = new Date();
        voteActive = false;
        clearInterval(intervalReminderBroadcasts);
        clearTimeout(timeoutVote);
      }
    });
  }
};
