// server.js
const express = require('express');
const http = require('http');
const Server = require('socket.io');
const cors = require('cors');
const GET = require('./api.cjs');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = Server(server, {
    cors: {
        origin: 'http://localhost:3000',
        methods: ['GET', 'POST'],
    },
});

app.get('/', (req, res) => {
    res.status(200).json({ data: 'Hello!' })
})

const rooms = {};

const disconnectRoutine = ({ socket, data }) => {
    let roomId = null;
    if (data) {
        roomId = data.roomId;
    }
    else {
        roomId = Object.keys(rooms).find((roomId) =>
            rooms[roomId].players.find((player) => player.id === socket.id));
    }
    if (roomId) {
        if (data) {
            rooms[roomId].players = rooms[roomId].players.filter((player) => player.username !== data.username);
        }
        else {
            rooms[roomId].players = rooms[roomId].players.filter((player) => player.id !== socket.id);
        }
        if (rooms[roomId].players.length === 0) {
            // Remove empty rooms
            delete rooms[roomId];
        }
        else {
            rooms[roomId].playAgain.length = 0;
        }
        io.to(roomId).emit('user left', socket.id);
    }
}

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Listen for user name
    socket.on('set username', async (username) => {
        // Check if the user with the same name is already in a room
        const existingRoomId = Object.keys(rooms).find(
            (roomId) => rooms[roomId].players.find((player) => player.username === username)
        );

        // If the user is in a room, inform the client
        if (existingRoomId) {
            socket.emit('username taken');
            return;
        }

        // Check for available rooms
        let availableRoom = null;
        for (const roomId in rooms) {
            if (rooms[roomId].players.length < 2) {
                availableRoom = roomId;
                break;
            }
        }

        // If no available room, create a new one
        if (!availableRoom) {
            const newRoomId = new Date().toISOString();
            rooms[newRoomId] = {
                players: [{ id: socket.id, username, score: { correctGuesses: 0, remainingTries: 6 } }],
                totalLetters: 0,
                playAgain: [],
                fetchingWord: false
            };
            socket.join(newRoomId); // Join the socket to the room
            io.to(newRoomId).emit('room joined', { roomId: newRoomId, players: rooms[newRoomId].players });
        } else {
            // Add the player to the available room
            rooms[availableRoom].players.push({ id: socket.id, username, score: { correctGuesses: 0, remainingTries: 6 } });
            socket.join(availableRoom); // Join the socket to the room
            io.to(availableRoom).emit('room joined', { roomId: availableRoom, players: rooms[availableRoom].players });
        }
    });

    // Once room is full, listen for 'initialize game' to send word with meaning
    socket.on('initialize game', async ({ roomId }) => {
        if (!rooms[roomId].fetchingWord) {
            rooms[roomId].fetchingWord = true;
            const wordInfo = await GET();
            rooms[roomId].totalLetters = wordInfo.word.length;
            io.to(roomId).emit('get word', { wordInfo, data: rooms[roomId] });
            rooms[roomId].fetchingWord = false;
        }
    });

    // Listen for chat messages
    socket.on('handle guess', (data) => {
        const roomId = data.roomId;
        if (roomId) {
            for (let player of rooms[roomId].players) {
                if (player.username === data.username) {
                    if (data.correct) {
                        player.score.correctGuesses += data.correctGuessedLetters;
                    }
                    else {
                        player.score.remainingTries--;
                    }
                }
            }
            // Broadcast the message to all players in the room
            io.to(roomId).emit('update scoreboard', rooms[roomId]);
        }
    });

    socket.on('play again', ({ roomId, username }) => {
        if (roomId) {
            if (rooms[roomId].playAgain.length === 0) {
                rooms[roomId].playAgain.push(username);
            }
            else if (rooms[roomId].playAgain.length === 1 && rooms[roomId].playAgain[0] !== username) {
                rooms[roomId].playAgain.length = 0;
                rooms[roomId].totalLetters = 0;
                for (let player of rooms[roomId].players) {
                    player.score = { correctGuesses: 0, remainingTries: 6 };
                }
                io.to(roomId).emit('play again', { info: 'play', roomId, data: rooms[roomId] });
            }
        }
    });

    socket.on('leave room', (roomId, scoreboard, username) => {
        if (scoreboard) {
            rooms[roomId] = {
                players: scoreboard,
                totalLetters: 0,
                playAgain: []
            };
            for (let player of rooms[roomId].players) {
                player.score = { correctGuesses: 0, remainingTries: 6 };
            }
            disconnectRoutine({ socket: null, data: { username, roomId } });
        }
        else {
            disconnectRoutine({ socket, data: null });
        }
    });

    socket.on('disconnect', () => {
        console.log('user disconnected');
        // Remove the disconnected user from the room
        disconnectRoutine({ socket, data: null });
    });
});
server.listen(3001, () => {
    console.log('listening on *:3001');
});

module.exports = app;