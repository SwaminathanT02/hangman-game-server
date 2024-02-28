const mongoose = require("mongoose");

const playerSchema = new mongoose.Schema({
    socketId: { type: String, required: true },
    username: { type: String, required: true },
    score: {
        correctGuesses: { type: Number, default: 0 },
        remainingTries: { type: Number, default: 6 },
    },
});

const roomSchema = new mongoose.Schema({
    roomId: { type: String, required: true, unique: true },
    players: [playerSchema],
    totalLetters: { type: Number, required: true },
    fetchingWord: { type: Boolean, default: false },
    playAgain: { type: [String], default: [] }
});

module.exports = mongoose.models.Room || mongoose.model('Room', roomSchema);
