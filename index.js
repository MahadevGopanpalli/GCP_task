const express = require('express');
const app = express();
const session = require('express-session');
const multer = require('multer');
const { google } = require('googleapis');
const fs = require('fs');
const config = require('./config.json');
const { Readable } = require('stream');
const bodyParser = require('body-parser');

app.set('view engine', 'ejs');
app.use(bodyParser())
app.use(session({
  resave: false,
  saveUninitialized: true,
  secret: 'SECRET' 
}));

app.get('/', function(req, res) {
  res.render('pages/auth');
});

const port = process.env.PORT || 3000;
app.listen(port , () => console.log('App listening on port ' + port));


var passport = require('passport');
const { isNullOrUndefined } = require('util');
var userProfile;
var oauth2Client;
var drive;

app.use(passport.initialize());
app.use(passport.session());
 
app.get('/success', (req, res) => {
  res.render('pages/success', {user: userProfile});
});
app.get('/error', (req, res) => res.send("error logging in"));
 
passport.serializeUser(function(user, cb) {
  cb(null, user);
});
 
passport.deserializeUser(function(obj, cb) {
  cb(null, obj);
});


/*  Google AUTH  */
 
var GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
const GOOGLE_CLIENT_ID = config.client_id;
const GOOGLE_CLIENT_SECRET = config.client_secret;

passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/callback"
  },
  function(accessToken, refreshToken, profile, done) {
      userProfile=profile;
      oauth2Client = new google.auth.OAuth2(
        config.client_id,
        config.client_secret,
        "http://localhost:3000/auth/google/callback"
      );
      
      // Authorize the client with a refresh token
      console.log("Authorized with --",profile)
      oauth2Client.setCredentials({
        refresh_token: accessToken
      });
      
      // Create a new Drive API client
      drive = google.drive({
        version: 'v3',
        auth: oauth2Client
      });
      return done(null, userProfile);
  }
));
 
app.get('/auth/google', 
  passport.authenticate('google', { scope : ['profile', 'email','https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file'
] }));
 
app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/error' }),
  function(req, res) {
    // Successful authentication, redirect success.
    res.redirect('/success');
  });


  
  // Define the maximum file size (in bytes)
  const maxFileSize = 50 * 1024 * 1024;
  
  // Configure Multer to handle file uploads
  const upload = multer({
    limits: { fileSize: maxFileSize }
  });
  function handleMulterError(err, req, res, next) {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      // handle file size limit error here
      res.status(400).json({ error: 'File too large' });
    } else {
      next(err);
    }
  }
  function checkAutorization(req, res, next)
  {
    if(isNullOrUndefined(oauth2Client))
    {
        return res.status(403).json({ error: 'Not Autorized' });
    }
    next()
  }
  app.post('/upload',checkAutorization,upload.single('file'), handleMulterError,(req, res) => {
    // Check if a file was 
    console.log("Uploading a file..........")
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
  
    // Create a readable stream from the uploaded file
    // const fileStream = fs.createReadStream(req.file.path);
  
    // Define the metadata for the new file
    const fileMetadata = {
      name: req.file.originalname
    };
    const stream = new Readable();
    stream.push(req.file.buffer);
    stream.push(null);

    // Define the request parameters for the file upload
    const media = {
      mimeType: req.file.mimetype,
      body: stream
    };
  
    // Upload the file to Google Drive
    drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id'
    }, (err, file) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to upload file to Google Drive' });
      } else {
        console.log(`File ID: ${file.data.id}`);
        return res.status(200).json({ data:file.data ,message: 'File uploaded successfully' });
      }
    });
  });


  app.get('/getFiles',checkAutorization,(req, res) => {
    console.log("Get files-------")
    drive.files.list({
      q: "mimeType != 'application/vnd.google-apps.folder'",
      fields: 'nextPageToken, files(id, name, mimeType, createdTime)'
    }, (err, response) => {
      if (err) {
        console.error(err);
        return res.status(500).send(err);
      }
      const files = response.data.files;
      console.log('Files:', files);
      return res.status(200).send(files);
    });
  });


  app.post('/shareFile',checkAutorization, (req, res) => {
    console.log("Sharing file with the ---",req.body.emailId,"-----",req.body.fileId);
    let f = req.body.fileId;
    console.log(f)
    const permissions = {
      type: 'user',
      role: 'writer',
      emailAddress: req.body.emailId,
    };
    drive.permissions.create({  
      resource: permissions,
      fileId: f,
      sendNotificationEmail: true
    }, (err, response) => {
      if (err) {
        console.error(err);
        return res.status(500).send(err);
      }
      console.log('File shared successfully');
      return res.status(200).send('File shared successfully');
    });
  });
  