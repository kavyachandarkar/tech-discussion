const express = require("express");
const app = express();
const port = 8080;
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const methodOverride = require("method-override");
const nodemailer = require("nodemailer");
const twilio = require("twilio");
const bcrypt = require("bcrypt");
const session = require("express-session");

// Twilio config
const accountSid = "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const authToken = "your_auth_token";
const twilioPhoneNumber = "+1XXXXXXXXXX";
const twilioClient = twilio(accountSid, authToken);

// Email setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "your_email@gmail.com",
    pass: "your_app_password"
  }
});

// In-memory data
let users = [];
let posts = [];
let notifications = {};

// App config
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));
app.use(session({
  secret: "thisshouldbeabettersecret",
  resave: false,
  saveUninitialized: false
}));

// Middleware to inject currentUser into all views
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user?.username || null;
  next();
});

// Sample posts data
posts = [
  { id: uuidv4(), username: "techguru", content: "AI is transforming the software industry rapidly!", comments: [] },
  { id: uuidv4(), username: "coderlife", content: "Top 5 JavaScript frameworks in 2025: React, Vue, Svelte, SolidJS, Qwik.", comments: [] },
  { id: uuidv4(), username: "devdaily", content: "Don't ignore cybersecurity—keep your systems updated!", comments: [] },
  { id: uuidv4(), username: "technews", content: "NVIDIA just released a new GPU optimized for deep learning workloads.", comments: [] },
  { id: uuidv4(), username: "opensourcefan", content: "Linux 6.5 kernel brings improved performance and better hardware support.", comments: [] },
  { id: uuidv4(), username: "mobilegeek", content: "Foldable phones are gaining popularity, but are they durable?", comments: [] },
  { id: uuidv4(), username: "techinsider", content: "Quantum computing will revolutionize encryption methods in the next decade.", comments: [] },
  { id: uuidv4(), username: "aienthusiast", content: "Generative AI models are becoming more creative and accessible.", comments: [] },
  { id: uuidv4(), username: "pepsale", content: "🔥 Don't miss our summer tech sale – Up to 70% off on gadgets! #Pepsale", comments: [] }
];


// Auth middleware
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

// Routes

app.get("/", (req, res) => res.redirect("/posts"));

// Posts routes
app.get("/posts", (req, res) => {
  res.render("index", { posts });
});

app.get("/posts/new", requireLogin, (req, res) => {
  res.render("new");
});

app.post("/posts", requireLogin, (req, res) => {
  const username = req.session.user.username;
  const { content } = req.body;
  const newPost = {
    id: uuidv4(),
    content,
    username,
    comments: []
  };
  posts.push(newPost);
  res.redirect("/posts");
});

app.get("/posts/:id/edit", requireLogin, (req, res) => {
  const { id } = req.params;
  const post = posts.find(p => p.id === id);
  if (!post || post.username !== req.session.user.username) return res.redirect("/posts");
  res.render("edit", { post });
});

app.patch("/posts/:id", requireLogin, (req, res) => {
  const { id } = req.params;
  const foundPost = posts.find(p => p.id === id);
  if (foundPost && foundPost.username === req.session.user.username) {
    foundPost.content = req.body.content;
  }
  res.redirect("/posts");
});

app.delete("/posts/:id", requireLogin, (req, res) => {
  const { id } = req.params;
  // Delete only if post belongs to logged-in user
  posts = posts.filter(p => !(p.id === id && p.username === req.session.user.username));
  res.redirect("/posts");
});

// Notifications routes

// NOTIFICATION FETCH
app.get("/users/:id/notifications", requireLogin, (req, res) => {
  const username = req.params.id;
  if (req.session.user.username !== username) return res.status(403).send("Forbidden");
  res.render("notifications", {
    username,
    notifications: notifications[username] || []
  });
});

app.post('/notifications', requireLogin, (req, res) => {
  const { postId, receiverUsername } = req.body;
  const liker = req.session.user.username;

  if (liker === receiverUsername) {
    return res.redirect('/posts');
  }

  const post = posts.find(p => p.id === postId);
  if (!post) {
    return res.status(404).send('Post not found');
  }

  const recipient = users.find(u => u.username === receiverUsername);
  if (!recipient) {
    return res.status(404).send('User not found');
  }

  const message = `Your post was liked by ${liker}`;

  if (!notifications[recipient.username]) notifications[recipient.username] = [];
  notifications[recipient.username].push(message);

  if (recipient.email) {
    transporter.sendMail({
      from: "your_email@gmail.com",
      to: recipient.email,
      subject: "Your Post Got a Like!",
      text: message
    }).catch(err => console.log("Email send error:", err));
  }

  if (recipient.phone) {
    twilioClient.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to: recipient.phone
    }).catch(err => console.log("SMS send error:", err));
  }

  res.redirect('/posts');
});

// Fix DELETE post logic
app.delete("/posts/:id", requireLogin, (req, res) => {
  const { id } = req.params;
  posts = posts.filter(p => !(p.id === id && p.username === req.session.user.username));
  res.redirect("/posts");
});


app.post('/posts/:id/comments', requireLogin, (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const commenter = req.session.user.username;

  const post = posts.find(p => p.id === id);
  if (!post) return res.status(404).send("Post not found");

  const commentData = { username: commenter, text: comment };
  post.comments.push(commentData);

  // Notify post owner (if not same as commenter)
  if (commenter !== post.username) {
    const message = `${commenter} commented on your post: "${comment}"`;

    if (!users[post.username]) {
      users[post.username] = { notifications: [] };
     }
    if (!users[post.username].notifications) {
      users[post.username].notifications = [];
    }
    users[post.username].notifications.push("New like received");


    const recipient = users.find(u => u.username === post.username);
    if (recipient?.email) {
      transporter.sendMail({
        from: "your_email@gmail.com",
        to: recipient.email,
        subject: "New Comment on Your Post",
        text: message
      }).catch(err => console.log("Email send error:", err));
    }

    if (recipient?.phone) {
      twilioClient.messages.create({
        body: message,
        from: twilioPhoneNumber,
        to: recipient.phone
      }).catch(err => console.log("SMS send error:", err));
    }
  }

  // Optional: Notify commenter too
  const selfMessage = `You commented on @${post.username}'s post: "${comment}"`;
  if (!notifications[commenter]) notifications[commenter] = [];
  notifications[commenter].push(selfMessage);

  res.redirect('/posts');
});

// Auth routes
app.get('/posts/:id/edit', (req, res) => {
  const postId = parseInt(req.params.id);
  const post = posts.find(p => p.id === postId);
  if (!post) return res.status(404).send('Post not found');
  res.render('edit', { post });
});



app.get("/signup", (req, res) => {
  res.render("signup");
});

app.post("/signup", async (req, res) => {
  const { username, password, email, phone } = req.body;
  const existingUser = users.find(u => u.username === username);
  if (existingUser) return res.send("Username already exists");

  const hashedPassword = await bcrypt.hash(password, 12);
  users.push({ username, password: hashedPassword, email, phone });
  req.session.user = { username };
  res.redirect("/posts");
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username);
  if (!user) return res.send("Invalid credentials");

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.send("Invalid credentials");

  req.session.user = { username };
  res.redirect("/posts");
});

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.log(err);
      return res.redirect('/posts'); // or any fallback
    }
    res.redirect('/login'); // redirect to login page
  });
});


// Server start
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
