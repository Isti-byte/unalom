const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;

// Create HTTP server
const server = http.createServer();

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store game sessions
const sessions = new Map();
let currentSessionId = 0;

wss.on('connection', (ws) => {
  console.log('Client connected');
  
  let sessionId = null;
  let clientType = null; // 'host' or 'joiner'
  let gameSession = null;
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'host') {
        // Client wants to host a game
        currentSessionId++;
        sessionId = currentSessionId;
        clientType = 'host';
        
        gameSession = {
          id: sessionId,
          host: ws,
          joiner: null,
          gameStarted: false
        };
        
        sessions.set(sessionId, gameSession);
        console.log(`Host created session ${sessionId}`);
        
      } else if (data.type === 'join') {
        // Client wants to join a game
        // Find the first available session that's waiting for a joiner
        let joinedSession = null;
        
        for (let [id, session] of sessions) {
          if (session.host && !session.joiner && !session.gameStarted) {
            joinedSession = session;
            sessionId = id;
            break;
          }
        }
        
        if (joinedSession) {
          clientType = 'joiner';
          joinedSession.joiner = ws;
          gameSession = joinedSession;
          
          console.log(`Joiner connected to session ${sessionId}`);
          
          // Notify both players that the game is starting
          joinedSession.host.send(JSON.stringify({
            type: 'gameStart'
          }));
          
          ws.send(JSON.stringify({
            type: 'gameStart'
          }));
          
          joinedSession.gameStarted = true;
        } else {
          // No available session
          ws.send(JSON.stringify({
            type: 'error',
            message: 'No available games to join'
          }));
        }
        
      } else if (data.type === 'playerMove') {
        // Forward player movement to the other player
        if (gameSession) {
          if (clientType === 'host' && gameSession.joiner) {
            gameSession.joiner.send(JSON.stringify(data));
          } else if (clientType === 'joiner' && gameSession.host) {
            gameSession.host.send(JSON.stringify(data));
          }
        }
      }
    } catch (e) {
      console.error('Message parse error:', e);
    }
  });
  
  ws.on('close', () => {
    console.log('Client disconnected');
    
    if (gameSession) {
      if (clientType === 'host') {
        // Notify joiner that host disconnected
        if (gameSession.joiner && gameSession.joiner.readyState === WebSocket.OPEN) {
          gameSession.joiner.send(JSON.stringify({
            type: 'hostDisconnected'
          }));
          gameSession.joiner.close();
        }
      } else if (clientType === 'joiner') {
        // Notify host that joiner disconnected
        if (gameSession.host && gameSession.host.readyState === WebSocket.OPEN) {
          gameSession.host.send(JSON.stringify({
            type: 'joinerDisconnected'
          }));
        }
      }
      
      // Remove session
      if (sessionId) {
        sessions.delete(sessionId);
      }
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

server.listen(PORT, () => {
  console.log(`Pong Server running on ws://localhost:${PORT}`);
  console.log('Waiting for connections...');
});
