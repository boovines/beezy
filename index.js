/* The express module is used to look at the address of the request and send it to the correct function */
var express = require('express');
var bodyParser = require('body-parser');
var Io = require('socket.io')
var http = require('http');
var usermodel = require('./user.js').getModel();
var crypto = require('crypto');
var mongoose = require('mongoose')
var path = require('path');
var passport = require('passport')
var LocalStrategy = require('passport-local').Strategy
var session = require('express-session');
var fs = require('fs')
var app = express();
var server = http.createServer(app);
var io = Io(server)
var iterations = 10000;

/* Defines what port to use to listen to web requests */
var port = process.env.PORT ? parseInt(process.env.PORT) : 8080;

var dbAddress = process.env.MONGODB_URI || 'mongodb://127.0.0.1/game'

function addSockets() {

  var players = {};

  io.on('connection', (socket) => {
    var user = socket.handshake.query.user;
    players[user] = {
      x: 0,
      y: 0
    };
    io.emit('playerUpdate', players);
    io.emit('new message', {
      user: user,
      message: 'Entered the game'
    });
    //io.emit('new message', 'user connected')
    socket.on('disconnect', () => {
      delete players[user];
      io.emit('new message', {
        user: user,
        message:
        'Left the game'
      })
      io.emit('playerUpdate', players);
      //io.emit('new message', 'user disconnected')
    })
    socket.on('message', (message) => {
      io.emit('new message', message);
    });
    socket.on('playerUpdate', (player) => {
      players[user] = player;
      io.emit('playerUpdate', players);
    })
  });
}

function startServer() {
  function authenticateUser(username, password, callback) {
    if (!username) return callback('No username given');
    if (!password) return callback('No password given');
    usermodel.findOne({
      username: username
    }, (err, user) => {
      if (err) return callback('Error connecting to database');
      if (!user) return callback('Incorrect Username');
      crypto.pbkdf2(password, user.salt, iterations, 256, 'sha256', (err, resp) => {
        if (err) return callback('Error handling password');
        if (resp.toString('base64') === user.password) return callback(null, user);
        callback('Incorrect password');
      });
    })
  }

  addSockets();
  app.use(bodyParser.json({
    limit: '16mb'
  }));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(session({
    secret: 'Knowledge'
  }));
  app.use(passport.initialize());
  app.use(passport.session());
  passport.use(new LocalStrategy({
    usernameField: 'username',
    passwordField: 'password'
  }, authenticateUser));
  passport.serializeUser(function(user, done) {
    done(null, user.id);
  });

  passport.deserializeUser(function(id, done) {
    usermodel.findById(id, function(err, user) {
      done(err, user);
    })
  })
  app.get('/create', (req, res, next) => {
    var filePath = path.join(__dirname, '/index.html')
    res.sendFile(filePath);
  });
  app.get('/logout', (req, res, next) => {
    req.logOut();
    res.redirect('/login?error=PERISH%20FOOL%20You%20Logged%20Out');
  })
  app.get('/game', (req, res, next) => {
    if (!req.user) return res.redirect('/login?error=PERISH%20FOOL%20YOU%20MUST%20LOGIN')
    var filePath = path.join(__dirname, './game.html')
    var fileContents = fs.readFileSync(filePath, 'utf8')
    fileContents = fileContents.replace('{{USER}}', req.user.username);
    res.send(fileContents);
  });
  app.get('/login', (req, res, next) => {
    var filePath = path.join(__dirname, './login.html')
    res.sendFile(filePath);
  });

  app.get('/picture/:username', (req, res, next) => {
    if (!req.user) return res.send('YOU ARE NOT LOGGED IN');
    usermodel.findOne({
      username: req.params.username
    }, function(err, user) {
      if (err) return res.send(err);
      try {
        var imageType = user.avatar.match(/^data:image\/([a-zA-Z0-9]*)/)[1];
        var base64Data = user.avatar.split(',')[1];
        var binaryData = new Buffer(base64Data, 'base64');
        res.contentType('image/' + imageType);
        res.end(binaryData, 'binary');
      } catch (ex) {
        res.send(ex);
      }
    })
  })

  app.get('/', (req, res, next) => {
    var filePath = path.join(__dirname, './home.html')
    res.sendFile(filePath)
  });

  app.get('/hw1', (req, res, next) => {
    var filePath = path.join(__dirname, './Hw1.html')
    res.sendFile(filePath)
  });
  app.post('/', (req, res, next) => {
    var filePath = path.join(__dirname, './home.html')
    res.sendFile(filePath);
  });
  app.post('/login', (req, res, next) => {
    passport.authenticate('local', function(err, user) {
      if (err) return res.send({
        error: err
      });

      req.logIn(user, (err) => {
        if (err) return res.send({
          error: err
        });
        return res.send({
          error: null
        })
      })
    })(req, res, next);
  });
  app.post('/create', (req, res, next) => {
    var newuser = new usermodel(req.body);
    var password = req.body.password;
    var salt = crypto.randomBytes(128).toString('base64');
    newuser.salt = salt;
    // Winding up the crypto hashing lock 10000 times
    crypto.pbkdf2(password, salt, iterations, 256, 'sha256', function(err, hash) {
      if (err) {
        return res.send({
          error: err
        });
      }
      newuser.password = hash.toString('base64');
      // Saving the user object to the database
      newuser.save(function(err) {

        // Handling the duplicate key errors from database
        if (err && err.message.includes('duplicate key error') && err.message.includes('userName')) {
          return res.send({
            error: 'Username, ' + req.body.userName + 'already taken'
          });
        }
        if (err) {
          return res.send({
            error: err.message
          });
        }
        passport.authenticate('local', function(err, user) {
          if (err) return res.send({
            error: err
          });

          req.logIn(user, (err) => {
            if (err) return res.send({
              error: err
            });
            return res.send({
              error: null
            })
          })
        })(req, res, next);
      });
    });
  });

  /* Defines what function to all when the server recieves any request from http://localhost:8080 */
  server.on('listening', () => {


    /* Determining what the server is listening for */
    var addr = server.address(),
      bind = typeof addr === 'string' ?
      'pipe ' + addr :
      'port ' + addr.port;

    /* Outputs to the console that the webserver is ready to start listenting to requests */
    console.log('Listening on ' + bind);
  });
}

/* Tells the server to start listening to requests from defined port */
server.listen(port);
mongoose.connect(dbAddress, startServer)
