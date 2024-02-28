// server.js
const express = require('express');
const http = require('http');
const Server = require('socket.io');
const cors = require('cors');
const GET = require('./api.cjs');
const Room = require('./Room.cjs');
const Connect = require('./db.cjs');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = Server(server, {
    cors: {
        origin: process.env.SERVER_ORIGIN,
        methods: ['GET', 'POST'],
    },
});

app.get('/', (req, res) => {
    res.status(200).json({ data: 'Hello World!' })
});

io.on('connection', async (socket) => {
    console.log(`User connected: ${socket.id}`);
    await Connect();

    // Listen for user name
    socket.on('set username', async (username) => {
        // Check if the user with the same name is already in a room
        const existingRoomId = await Room.findOne({ 'players.username': username });

        // If the user is in a room, inform the client
        if (existingRoomId) {
            socket.emit('username taken');
            return;
        }

        // Check for available rooms
        const availableRoom = await Room.findOne({ 'players': { $size: 1 } });

        // If no available room, create a new one
        if (!availableRoom) {
            const currentDate = btoa(new Date().toISOString());
            const newRoomId = currentDate.slice(currentDate.length - 5);
            const newRoom = {
                roomId: newRoomId,
                players: [{ socketId: socket.id, username, score: { correctGuesses: 0, remainingTries: 6 } }],
                totalLetters: 0,
                playAgain: [],
                fetchingWord: false
            };
            await Room.create(newRoom);
            socket.join(newRoomId); // Join the socket to the room
            io.to(newRoomId).emit('room joined', { room: newRoom });
        } else {
            // Add the player to the available room
            const updatedRoom = await Room.findOneAndUpdate(
                { roomId: availableRoom.roomId, 'players.username': { $ne: username } },
                {
                    $addToSet: {
                        players: {
                            $each: [
                                {
                                    socketId: socket.id,
                                    username: username,
                                    score: { correctGuesses: 0, remainingTries: 6 },
                                },
                            ],
                        },
                    },
                },
                { new: true }
            );
            socket.join(availableRoom.roomId); // Join the socket to the room
            io.to(availableRoom.roomId).emit('room joined', { room: updatedRoom, initializer: updatedRoom.players[0].username });
        }
    });

    // Once room is full, listen for 'initialize game' to send word with meaning
    socket.on('initialize game', async (data) => {
        const room = await Room.findOne({ roomId: data.room.roomId });
        if (room.fetchingWord === false) {
            await Room.updateOne({ roomId: data.room.roomId }, { $set: { fetchingWord: true } });
            const wordInfo = await GET();
            await Room.updateOne({ roomId: data.room.roomId }, { $set: { totalLetters: wordInfo.word.length } });
            io.to(data.room.roomId).emit('get word', { wordInfo, room: { ...data.room, totalLetters: wordInfo.word.length } });
            await Room.updateOne({ roomId: data.room.roomId }, { $set: { fetchingWord: false } });
        }
    });

    // Listen for chat messages
    socket.on('handle guess', (data) => {
        io.to(data.room.roomId).emit('update scoreboard', { room: data.room });
    });

    socket.on('play again', async (data) => {
        const room = await Room.findOne({ roomId: data.room.roomId });
        if (room.playAgain.length === 0) {
            const updatedRoom = await Room.findOneAndUpdate(
                {
                    roomId: data.room.roomId,
                    'playAgain': { $ne: data.username },
                },
                {
                    $addToSet: {
                        playAgain: data.username,
                    },
                },
                { new: true }
            );
            io.to(data.room.roomId).emit('play again', { info: 'wait', room: updatedRoom, initializer: updatedRoom.players[0].username });
        }
        else if (room.playAgain.length === 1 && room.playAgain[0] !== data.username) {
            const updatedRoom = await Room.findOneAndUpdate(
                { roomId: data.room.roomId },
                {
                    $set: {
                        'playAgain': [],
                        'totalLetters': 0,
                        'fetchingWord': false,
                        'players.$[].score': { correctGuesses: 0, remainingTries: 6 },
                    },
                },
                { new: true }
            );
            io.to(data.room.roomId).emit('play again', { info: 'play', room: updatedRoom, initializer: updatedRoom.players[0].username });
        }
    });

    socket.on('leave room', async (data) => {
        console.log(`User Left: ${socket.id}`);
        disconnectRoutine({ data, socket, disconnected: false });
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        disconnectRoutine({ data: null, socket, disconnected: true });
    })

    async function disconnectRoutine(data) {
        let searchCondition = (data.disconnected) ? { 'players.socketId': data.socket.id } : { roomId: data.data.room.roomId };
        let pullCondition = (data.disconnected) ? { 'players': { socketId: data.socket.id } } : { 'players': { username: data.data.username } };
        const updatedRoom = await Room.findOneAndUpdate(
            searchCondition,
            {
                $set: {
                    'playAgain': [],
                    'totalLetters': 0,
                    'fetchingWord': false
                },
                $pull: pullCondition
            },
            { new: true }
        );

        if (updatedRoom && updatedRoom.roomId) {
            if (updatedRoom.players.length === 0) {
                // Remove empty rooms
                await Room.deleteOne({ roomId: updatedRoom.roomId });
            }
            else {
                io.to(updatedRoom.roomId).emit('user left', 'user left');
            }
        }

    }
});
server.listen(3001, async () => {
    await Connect();
    console.log('listening on *:3001');
});

module.exports = app;