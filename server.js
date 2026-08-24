// server.js
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const multer = require("multer");
const path = require("path");
const errorHandler = require("./middleware/errorHandler");
const { contactUsSchema } = require("./validators/contactus");
const axios = require("axios");
const xml2js = require("xml2js");
const { SitemapStream, streamToPromise } = require('sitemap');
const { createGzip } = require('zlib');
const { S3Client } = require("@aws-sdk/client-s3");
const multerS3 = require("multer-s3");


dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'build')));


// 1. Initialize S3 Client for DigitalOcean Bangalore (blr1)
const s3 = new S3Client({
    endpoint: "https://blr1.digitaloceanspaces.com",
    region: "us-east-1", // Must be us-east-1 for DO compatibility
    credentials: {
        accessKeyId: process.env.DO_SPACES_KEY,
        secretAccessKey: process.env.DO_SPACES_SECRET,
    },
});

// 2. Redefine 'upload' to use DigitalOcean instead of local disk
const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.DO_SPACES_BUCKET,
        acl: "public-read", // Makes images viewable on your site
        contentType: multerS3.AUTO_CONTENT_TYPE, // Displays image in browser instead of downloading
        key: function (req, file, cb) {
            const cleanName = file.originalname.replace(/\s+/g, "-");
            cb(null, `blogs/${Date.now()}-${cleanName}`); // Stores in a 'blogs' folder
        },
    }),
});

// ========== Middleware ==========
app.use((req, res, next) => {
  console.log("👉 REQUEST:", req.method, req.url);
  next();
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  dotfiles: 'allow',
  index: false,
}));

app.use(
  cors({
    origin: [
      "http://localhost:3001",
      "https://hilarious-travesseiro-4a5013.netlify.app",
      "https://mindwork360.com",
      "https://www.mindwork360.com"
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*"); // allow all origins for testing
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});


app.use(express.json());
// app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ========== MySQL POOL (NEVER closes, ALWAYS reconnects) ==========
const mysql = require("mysql2");

const db = mysql
  .createPool({
    host: "162.241.252.224",
    user: "mijohhmy",
    password: "Pass,1234",
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  })
  .promise();

console.log("MySQL Pool Created Successfully");

// ========== Multer Upload Config ==========
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => cb(null, "uploads/"),
//   filename: (req, file, cb) => {
//     const uniqueName = Date.now() + "-" + file.originalname;
//     cb(null, uniqueName);
//   },
// });

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => cb(null, "uploads/"),
//   filename: (req, file, cb) => {
//     // Replace spaces, parentheses, and special characters with hyphens
//     const cleanName = file.originalname.replace(/[^a-zA-Z0-9.]/g, "-");
//     const uniqueName = Date.now() + "-" + cleanName;
//     cb(null, uniqueName);
//   },
// });
// const upload = multer({ storage });

// ========== Default Route ==========
app.get("/", (req, res) => {
  res.send(`Welcome to the ${process.env.NODE_ENV} backend of Kooulu`);
});

// ========== Import Existing Routes ==========
const userRoutes = require("./routes/userRoutes");
app.use("/api/users", userRoutes);

const adminRoutes = require("./routes/adminRoutes");
app.use("/api/admin", adminRoutes);


// sitemap api:

app.get('/sitemap.xml', async (req, res) => {
  res.header('Content-Type', 'application/xml');
  res.header('Content-Encoding', 'gzip');

  try {
    const smStream = new SitemapStream({ 
      hostname: 'https://mindwork360.com' 
    });
    const pipeline = smStream.pipe(createGzip());

    // 1. Static Pages
    smStream.write({ url: '/', changefreq: 'daily', priority: 1.0 });
    smStream.write({ url: '/about', changefreq: 'monthly', priority: 0.7 });
    smStream.write({ url: '/blogs', changefreq: 'daily', priority: 0.8 });
    smStream.write({ url: '/videolessons', changefreq: 'daily', priority: 0.8 });
    smStream.write({ url: '/lifelessons', changefreq: 'daily', priority: 0.8 });
    smStream.write({ url: '/faq', changefreq: 'monthly', priority: 0.5 });
    smStream.write({ url: '/psychotherapy', changefreq: 'monthly', priority: 0.6 });
    smStream.write({ url: '/resources', changefreq: 'monthly', priority: 0.6 });
    smStream.write({ url: '/contactus', changefreq: 'monthly', priority: 0.5 });

    // 2. Blogs
    const [blogs] = await db.query("SELECT slug FROM blogs WHERE status = 'approved'");
    blogs.forEach(blog => {
      smStream.write({ 
        url: `/blogs/${blog.slug}`, 
        changefreq: 'weekly', 
        priority: 0.7 
      });
    });

    // 3. Videos (commented out — dummy channel, update with real YouTube links later)
    // const allVideos = [
    //     ...(youtubeCache.lessons || []),
    //     ...(youtubeCache.shorts || []),
    //     ...(youtubeCache_l.lessons || []),
    //     ...(youtubeCache_l.shorts || []),
    // ];
    // allVideos.forEach(video => {
    //   const videoId = video.id?.videoId || video.id;
    //   smStream.write({
    //     url: `/video/${videoId}`,
    //     changefreq: 'monthly',
    //     priority: 0.6
    //   });
    // });

    smStream.end();
    const sitemapOutput = await streamToPromise(pipeline);
    res.send(sitemapOutput);

  } catch (e) {
    console.error("Sitemap error:", e);
    res.status(500).end();
  }
});





// ========== BLOG CREATION ROUTE ==========

app.post(
  "/api/blogs",
  upload.fields([
    { name: "banner_image", maxCount: 1 },
    { name: "thumbnail_image", maxCount: 1 },
    { name: "image1", maxCount: 1 },
    { name: "image2", maxCount: 1 },
    { name: "image3", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const data = { ...req.body };
      const files = req.files || {};

      // ✅ Normalize content strings
      for (let i = 1; i <= 5; i++) {
        const key = `blog_content${i}`;
        if (Array.isArray(data[key])) {
          data[key] = data[key].join("");
        }
      }

      // ✅ Strip HTML helper
      const stripHtml = (html) => {
        if (!html) return "";
        if (Array.isArray(html)) html = html.join("");
        if (typeof html !== "string") return "";
        return html.replace(/<[^>]*>/g, "").trim();
      };

      // ✅ Use .location (DigitalOcean URL) instead of .path (Local folder)
      data.banner_image = files.banner_image?.[0]?.location || "";
      data.thumbnail_image = files.thumbnail_image?.[0]?.location || "";
      data.image1 = files.image1?.[0]?.location || "";
      data.image2 = files.image2?.[0]?.location || "";
      data.image3 = files.image3?.[0]?.location || "";

      // ✅ Process content and create searchable text
      for (let i = 1; i <= 5; i++) {
        const key = `blog_content${i}`;
        const content = data[key] || "";
        data[key] = content;
        data[`${key}_text`] = stripHtml(content);
      }

      // ✅ Insert into DB
      const [result] = await db.query("INSERT INTO blogs SET ?", data);

      res.json({ message: "Blog created successfully in cloud", result });

    } catch (err) {
      console.error("DO Spaces Upload Error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);
// app.post(
//   "/api/blogs",
//   upload.fields([
//     { name: "banner_image", maxCount: 1 },
//     { name: "thumbnail_image", maxCount: 1 },
//     { name: "image1", maxCount: 1 },
//     { name: "image2", maxCount: 1 },
//     { name: "image3", maxCount: 1 },
//   ]),
//   async (req, res) => {
//     try {
//       const data = req.body;
//       const files = req.files;
//       const stripHtml = (html) => {
//         if (!html) return "";
      
        
//         const temp = html.replace(/&nbsp;/g, " ");
      
        
//         return temp.replace(/<[^>]*>/g, "").trim();
//       };

//       const values = {
//         ...data,
//         banner_image: files.banner_image ? files.banner_image[0].path : "",
//         thumbnail_image: files.thumbnail_image ? files.thumbnail_image[0].path : "",
//         image1: files.image1 ? files.image1[0].path : "",
//         image2: files.image2 ? files.image2[0].path : "",
//         image3: files.image3 ? files.image3[0].path : "",
        
//   blog_content1: data.blog_content1,
//   blog_content2: data.blog_content2,
//   blog_content3: data.blog_content3,
//   blog_content4: data.blog_content4,
//   blog_content5: data.blog_content5,

  
//   blog_content1_text: stripHtml(data.blog_content1),
//   blog_content2_text: stripHtml(data.blog_content2),
//   blog_content3_text: stripHtml(data.blog_content3),
//   blog_content4_text: stripHtml(data.blog_content4),
//   blog_content5_text: stripHtml(data.blog_content5),
//       };

//       const sql = `INSERT INTO blogs SET ?`;

//       const [result] = await db.query(sql, values);

//       res.json({ message: "Blog Created Successfully", result });
//     } catch (err) {
//       console.log("SQL ERROR:", err);
//       res.status(500).json({ message: "Database Insert Error", error: err });
//     }
//   }
// );

// =======================================================
// contact us page api
// =======================================================
app.post("/api/contact-us", upload.none(), async (req, res) => {
  try {
    console.log("BODY RECEIVED:", req.body);

    // Validate input
    const { error, value } = contactUsSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details.map((d) => d.message),
      });
    }

    const {
      first_name,
      last_name,
      email,
      country_code,
      phone,
      message,
      subject,
    } = value;

    const sql = `
      INSERT INTO contact_submissions 
      (first_name, last_name, email, country_code, phone, message, subject)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      first_name,
      last_name,
      email,
      country_code,
      phone,
      message,
      subject,
    ];

    await db.query(sql, params);

    res.json({
      success: true,
      message: "Contact form submitted successfully",
    });
  } catch (err) {
    console.log("Server Error:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// app.post("/api/contact-us", upload.none(), async (req, res) => {
//   try {
//     console.log("BODY RECEIVED:", req.body);

//     // Validate input
//     const { error, value } = contactUsSchema.validate(req.body, {
//       abortEarly: false,
//       stripUnknown: true,
//     });

//     if (error) {
//       return res.status(400).json({
//         success: false,
//         message: error.details.map((d) => d.message),
//       });
//     }

//     const {
//       first_name,
//       last_name,
//       email,
//       country_code,
//       phone,
//       message,
//       subject,
//     } = value;

//     //Check if email already exists
    
//     const checkEmailQuery = `SELECT email FROM contact_submissions WHERE LOWER(email) = LOWER(?)`;

//     const [existing] = await db.query(checkEmailQuery, [email]);

//     if (existing.length > 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Already subscribed, please check",
//       });
//     }

//     // Insert new record if email does NOT exist
//     const insertQuery = `
//       INSERT INTO contact_submissions 
//       (first_name, last_name, email, country_code, phone, message, subject)
//       VALUES (?, ?, ?, ?, ?, ?, ?)
//     `;

//     const params = [
//       first_name,
//       last_name,
//       email,
//       country_code,
//       phone,
//       message,
//       subject,
//     ];

//     await db.query(insertQuery, params);

//     res.json({
//       success: true,
//       message: "Contact form submitted successfully",
//     });

//   } catch (err) {
//     console.log("Server Error:", err);
//     res.status(500).json({ success: false, message: "Internal server error" });
//   }
// });

// -------------------------
// YOUTUBE CACHE SETUP
// -------------------------
let youtubeCache = {
  lessons: null,
  shorts: null,
  timestamp: null,
};

const YT_API_KEY = "AIzaSyCngySm9tpqUTHvEqP6jaOHUsDVlov3AKI";
const CHANNEL_ID = "UCzrqQ6sVfw_ToUaCbkvIm5w"; // MindWork360 (@mindwork360)
const CACHE_DURATION = 30 * 60 * 1000; 

async function fetchYouTubeData() {
  console.log("Fetching fresh YouTube data...");

  let videos = [];
  let nextPageToken = "";

  // Fetch all videos from the channel
  while (true) {
    const searchRes = await axios.get(
      "https://www.googleapis.com/youtube/v3/search",
      {
        params: {
          key: YT_API_KEY,
          channelId: CHANNEL_ID,
          part: "snippet",
          order: "date",
          maxResults: 50,
          type: "video",
          pageToken: nextPageToken,
        },
      }
    );

    const videoIds = searchRes.data.items
      .map((v) => v.id.videoId)
      .join(",");

    const videosRes = await axios.get(
      "https://www.googleapis.com/youtube/v3/videos",
      {
        params: {
          key: YT_API_KEY,
          id: videoIds,
          part: "snippet,statistics,contentDetails",
        },
      }
    );

    videos.push(...videosRes.data.items);

    nextPageToken = searchRes.data.nextPageToken;
    if (!nextPageToken) break; 
  }

  console.log("Total Videos Fetched:", videos.length);

  // Separate shorts & long videos
  const lessons = [];
  const shorts = [];

  videos.forEach((video) => {
    const duration = video.contentDetails.duration;
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);

    const totalSeconds =
      (parseInt(match[1] || 0) * 3600) +
      (parseInt(match[2] || 0) * 60) +
      parseInt(match[3] || 0);

    if (totalSeconds <= 90) shorts.push(video);
    else lessons.push(video);
  });

  youtubeCache = {
    lessons,
    shorts,
    timestamp: Date.now(),
  };

  console.log("YouTube cache updated.");

  return youtubeCache;
}
app.get("/api/youtube/:type", async (req, res) => {
  const { type } = req.params;

  // Read directly from cache
  return res.json({
    success: true,
    cached: true,
    data: youtubeCache[type] || [],
  });
});

youtubeCache.playlists = null;
async function fetchYouTubePlaylists() {
  console.log("Fetching YouTube playlists...");

  const playlistRes = await axios.get(
    "https://www.googleapis.com/youtube/v3/playlists",
    {
      params: {
        key: YT_API_KEY,
        channelId: CHANNEL_ID,
        part: "snippet,contentDetails",
        maxResults: 50,
      },
    }
  );

  youtubeCache.playlists = playlistRes.data.items;
  return youtubeCache.playlists;
}
app.get("/api/youtube/playlists", async (req, res) => {
  console.log("Playlists count:", youtubeCache.playlists?.length);
  return res.json({
    success: true,
    data: youtubeCache.playlists || [],
  });
});



app.get("/api/youtube/:type", async (req, res) => {
  const { type } = req.params; 
  const now = Date.now();

  // If cache is fresh (< 30 minutes), use it
  if (
    youtubeCache.timestamp &&
    now - youtubeCache.timestamp < CACHE_DURATION
  ) {
    return res.json({
      success: true,
      cached: true,
      data: youtubeCache[type] || [],
    });
  }

  // Otherwise fetch fresh data
  const data = await fetchYouTubeData();

  return res.json({
    success: true,
    cached: false,
    data: data[type] || [],
  });
});


// -------------------------
// YOUTUBE CACHE SETUP FOR LIFE LESSON
// -------------------------
let youtubeCache_l = {
  lessons: null,
  shorts: null,
  timestamp: null,
};

const YT_API_KEY_l = "AIzaSyCngySm9tpqUTHvEqP6jaOHUsDVlov3AKI";
// const CHANNEL_ID_l = "UC9pRPRlo6wIOakEOi_2RWwA"; // old dummy channel
const CHANNEL_ID_l = "UCzrqQ6sVfw_ToUaCbkvIm5w"; // MindWork360 (@mindwork360)
const CACHE_DURATION_l = 30 * 60 * 1000; 

async function fetchYouTubeData_l() {
  console.log("Fetching fresh YouTube data...");

  let videos = [];
let nextPageToken = "";
// const UPLOADS_PLAYLIST_ID = "UU9pRPRlo6wIOakEOi_2RWwA"; // old dummy channel
const UPLOADS_PLAYLIST_ID = "UU7IcJI8PUf5Z3zKxnZvTBog"; // same as video lessons channel

while (true) {
  const playlistRes = await axios.get(
    "https://www.googleapis.com/youtube/v3/playlistItems",
    {
      params: {
        key: YT_API_KEY_l,
        playlistId: UPLOADS_PLAYLIST_ID,
        part: "snippet,contentDetails",
        maxResults: 50,
        pageToken: nextPageToken,
      },
    }
  );

  const videoIds = playlistRes.data.items
    .map((v) => v.contentDetails.videoId)
    .join(",");

  const detailsRes = await axios.get(
    "https://www.googleapis.com/youtube/v3/videos",
    {
      params: {
        key: YT_API_KEY_l,
        id: videoIds,
        part: "snippet,statistics,contentDetails",
      },
    }
  );

  videos.push(...detailsRes.data.items);

  nextPageToken = playlistRes.data.nextPageToken;
  if (!nextPageToken) break;
}

  console.log("Total Videos Fetched:", videos.length);

  // Separate shorts & long videos
  const lessons = [];
  const shorts = [];

  videos.forEach((video) => {
    const duration = video.contentDetails.duration;
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);

    const totalSeconds =
      (parseInt(match[1] || 0) * 3600) +
      (parseInt(match[2] || 0) * 60) +
      parseInt(match[3] || 0);

    if (totalSeconds <= 90) shorts.push(video);
    else lessons.push(video);
  });

  youtubeCache_l = {
    lessons,
    shorts,
    timestamp: Date.now(),
  };

  console.log("YouTube cache updated.");

  return youtubeCache_l;
}
app.get("/api/youtube_l/:type", async (req, res) => {
  const { type } = req.params;

  // Read directly from cache
  return res.json({
    success: true,
    cached: true,
    data: youtubeCache_l[type] || [],
  });
});

// app.get("/api/youtube_l/:type", async (req, res) => {
//   const { type } = req.params; 
//   const now = Date.now();

//   // If cache is fresh (< 30 minutes), use it
//   if (
//     youtubeCache_l.timestamp &&
//     now - youtubeCache_l.timestamp < CACHE_DURATION_l
//   ) {
//     return res.json({
//       success: true,
//       cached: true,
//       data: youtubeCache_l[type] || [],
//     });
//   }

//   // Otherwise fetch fresh data
//   const data = await fetchYouTubeData_l();

//   return res.json({
//     success: true,
//     cached: false,
//     data: data[type] || [],
//   });
// });

// app.get("/api/youtube-search", async (req, res) => {
//   console.log("YouTube cache updated:/api/youtube-search");
//   const query = (req.query.q || "").toLowerCase();

//   if (!query) {
//     return res.json({ success: true, data: [] });
//   }

//   // Ensure cache is available (fetch if expired)
//   if (
//     !youtubeCache.timestamp ||
//     Date.now() - youtubeCache.timestamp >= CACHE_DURATION
//   ) {
//     await fetchYouTubeData();
//   }

//   if (
//     !youtubeCache_l.timestamp ||
//     Date.now() - youtubeCache_l.timestamp >= CACHE_DURATION_l
//   ) {
//     await fetchYouTubeData_l();
//   }

//   const allVideos = [
//     ...(youtubeCache.lessons || []),
//     ...(youtubeCache.shorts || []),
//     ...(youtubeCache_l.lessons || []),
//     ...(youtubeCache_l.shorts || []),
//   ];

//   const filtered = allVideos.filter((v) =>
//     v.snippet.title.toLowerCase().includes(query)
//   );

//   res.json({
//     success: true,
//     count: filtered.length,
//     data: filtered,
//   });
// });



app.get("/api/search-all", async (req, res) => {
  const query = (req.query.q || "").toLowerCase();
  if (!query) return res.json({ success: true, videos: [], blogs: [] });

  // 1. Filter Videos from Cache
  const allVideos = [
    ...(youtubeCache.lessons || []),
    ...(youtubeCache.shorts || []),
    ...(youtubeCache_l.lessons || []),
    ...(youtubeCache_l.shorts || []),
  ];
  const filteredVideos = allVideos.filter((v) => {
    const title = (v.snippet?.title || "").toLowerCase();
    // Safely extract the video ID
    const videoId = (v.id?.videoId || v.id || "").toLowerCase();

 
    return title.includes(query) || videoId === query;
  });

  // 2. Query Blogs from Database
  try {
    // Note: Adjust the table/column names to match your actual database
    const [blogs] = await db.query(
      "SELECT id, blog_title, slug, product_category, banner_image, blog_content1_text FROM blogs WHERE blog_title LIKE ? AND status = 'approved'",
      [`%${query}%`]
    );

    res.json({
      success: true,
      videos: filteredVideos,
      blogs: blogs
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});



app.get("/api/youtube-search", async (req, res) => {
  console.log("YouTube Search API called");

  const query = (req.query.q || "").toLowerCase();
  if (!query) {
    return res.json({ success: true, data: [] });
  }

  // Just read from cache — DO NOT refresh here
  const allVideos = [
    ...(youtubeCache.lessons || []),
    ...(youtubeCache.shorts || []),
    ...(youtubeCache_l.lessons || []),
    ...(youtubeCache_l.shorts || []),
  ];

  const filtered = allVideos.filter((v) =>
    v.snippet.title.toLowerCase().includes(query)
  );

  res.json({
    success: true,
    count: filtered.length,
    data: filtered,
  });
});

const AUTO_REFRESH_INTERVAL = 30 * 60 * 1000; 

async function refreshYouTubeCache() {
  try {
    console.log("Auto-refreshing YouTube caches...");

    await fetchYouTubeData();   
    await fetchYouTubeData_l(); 
    await fetchYouTubePlaylists(); 

    console.log("YouTube caches refreshed successfully");
  } catch (error) {
    console.error("Error refreshing YouTube cache:", error.message);
  }
}

// Run every 30 minutes
setInterval(refreshYouTubeCache, AUTO_REFRESH_INTERVAL); //--production

// Run immediately when server starts
refreshYouTubeCache(); //production



// const YT_API_KEY = "AIzaSyCngySm9tpqUTHvEqP6jaOHUsDVlov3AKI";

// // Channel IDs
// const CHANNEL_ID_V = "UC7IcJI8PUf5Z3zKxnZvTBog"; // Video Lessons
// const CHANNEL_ID_L = "UC9pRPRlo6wIOakEOi_2RWwA"; // Life Lessons

// // Uploads Playlist IDs (Generated by replacing UC with UU)
// const UPLOADS_ID_V = "UU7IcJI8PUf5Z3zKxnZvTBog"; // Video Lessons
// const UPLOADS_ID_L = "UU9pRPRlo6wIOakEOi_2RWwA"; // Life Lessons

// let youtubeCache = { lessons: [], shorts: [], playlists: [], timestamp: null };
// let youtubeCache_l = { lessons: [], shorts: [], playlists: [], timestamp: null };

// const CACHE_DURATION = 30 * 60 * 1000; // 30 mins

// // Helper: Parse YouTube ISO 8601 Duration to Seconds
// // function parseDuration(duration) {
// //   const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
// //   const hours = parseInt(match[1] || 0);
// //   const minutes = parseInt(match[2] || 0);
// //   const seconds = parseInt(match[3] || 0);
// //   return hours * 3600 + minutes * 60 + seconds;
// // }
// function parseDuration(duration) {
//   if (!duration) return 0;

//   const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  
//   if (!match) {
//     return duration.includes('P') && !duration.includes('T') ? 9999 : 0;
//   }

//   const hours = parseInt(match[1] || 0);
//   const minutes = parseInt(match[2] || 0);
//   const seconds = parseInt(match[3] || 0);

//   return (hours * 3600) + (minutes * 60) + seconds;
// }

// // Global Fetcher for any channel
// async function fetchChannelData(playlistId) {
//   let allVideos = [];
//   let nextPageToken = "";

//   try {
//     while (true) {
//       const playlistRes = await axios.get("https://www.googleapis.com/youtube/v3/playlistItems", {
//         params: {
//           key: YT_API_KEY,
//           playlistId: playlistId,
//           part: "snippet,contentDetails",
//           maxResults: 50,
//           pageToken: nextPageToken,
//         },
//       });

//       const videoIds = playlistRes.data.items.map((v) => v.contentDetails.videoId).join(",");

//       const detailsRes = await axios.get("https://www.googleapis.com/youtube/v3/videos", {
//         params: {
//           key: YT_API_KEY,
//           id: videoIds,
//           part: "snippet,statistics,contentDetails",
//         },
//       });

//       allVideos.push(...detailsRes.data.items);
//       nextPageToken = playlistRes.data.nextPageToken;
//       if (!nextPageToken) break;
//     }

//     const lessons = [];
//     const shorts = [];

//     allVideos.forEach((video) => {
//       const seconds = parseDuration(video.contentDetails.duration);
//       if (seconds <= 90) shorts.push(video);
//       else lessons.push(video);
//     });

//     return { lessons, shorts, timestamp: Date.now() };
//   } catch (err) {
//     console.error(`Error fetching playlist ${playlistId}:`, err.message);
//     return { lessons: [], shorts: [], timestamp: null };
//   }
// }

// // GET Video Lessons
// app.get("/api/youtube/:type", async (req, res) => {
//   const { type } = req.params;
//   const now = Date.now();

//   if (!youtubeCache.timestamp || (now - youtubeCache.timestamp > CACHE_DURATION)) {
//     console.log("Refreshing Video Lessons Cache...");
//     const data = await fetchChannelData(UPLOADS_ID_V);
//     youtubeCache = { ...data };
//   }

//   res.json({ success: true, data: youtubeCache[type] || [] });
// });

// // GET Life Lessons
// app.get("/api/youtube_l/:type", async (req, res) => {
//   const { type } = req.params;
//   const now = Date.now();

//   if (!youtubeCache_l.timestamp || (now - youtubeCache_l.timestamp > CACHE_DURATION)) {
//     console.log("Refreshing Life Lessons Cache...");
//     const data = await fetchChannelData(UPLOADS_ID_L);
//     youtubeCache_l = { ...data };
//   }

//   res.json({ success: true, data: youtubeCache_l[type] || [] });
// });

// async function refreshYouTubeCache() {
//   console.log("Auto-refreshing YouTube caches...");
//   youtubeCache = await fetchChannelData(UPLOADS_ID_V);
//   youtubeCache_l = await fetchChannelData(UPLOADS_ID_L);
//   console.log("YouTube caches refreshed.");
// }

// setInterval(refreshYouTubeCache, CACHE_DURATION);
// refreshYouTubeCache(); // Start on boot

// app.get("/api/search-all", async (req, res) => {
//   const query = (req.query.q || "").toLowerCase();
//   if (!query) return res.json({ success: true, videos: [], blogs: [] });

//   const allVideos = [
//     ...(youtubeCache.lessons || []),
//     ...(youtubeCache.shorts || []),
//     ...(youtubeCache_l.lessons || []),
//     ...(youtubeCache_l.shorts || []),
//   ];

//   const filteredVideos = allVideos.filter((v) => 
//     v.snippet.title.toLowerCase().includes(query)
//   );

//   try {
//     const [blogs] = await db.query(
//       "SELECT id, blog_title, slug, product_category, banner_image FROM blogs WHERE blog_title LIKE ? AND status = 'approved'",
//       [`%${query}%`]
//     );
//     res.json({ success: true, videos: filteredVideos, blogs: blogs });
//   } catch (err) {
//     res.status(500).json({ success: false, error: err.message });
//   }
// });






// ==========================
// POST API - Add Subscriber
// ==========================
app.post("/api/newsletter/subscribe", async (req, res) => {
  try {
    const { name, email } = req.body;

    //Validation
    if (!name || name.trim() === "") {
      return res.json({
        success: false,
        message: "Name is required",
      });
    }

    if (!email || email.trim() === "") {
      return res.json({
        success: false,
        message: "Email is required",
      });
    }

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.json({
        success: false,
        message: "Please enter a valid email",
      });
    }

    // Check if email exists
    const checkSql = "SELECT id FROM newsletter_subscribers WHERE email = ?";
    const [rows] = await db.query(checkSql, [email]);

    if (rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Email already subscribed!",
      });
    }

    // Insert only if valid AND new
    const insertSql = "INSERT INTO newsletter_subscribers (name, email) VALUES (?, ?)";
    await db.query(insertSql, [name, email]);

    return res.json({
      success: true,
      message: "Subscribed successfully!",
    });

  } catch (error) {
    console.error("Server Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});



// blog listing page API's:

app.get("/api/blog-categories", async (req, res) => {
  console.log("entered into category api");
  
  try {
    const sql = `
      SELECT DISTINCT product_category 
      FROM blogs 
      WHERE product_category IS NOT NULL AND product_category != ''
    `;

    const [rows] = await db.query(sql);  // ✅ Promise pool usage

    res.json(rows.map(row => row.product_category));
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: "DB error" });
  }
});

app.get("/api/blogs_listing", async (req, res) => {
  const { status } = req.query;

  let sql = `
    SELECT
      id,
      blog_title,
      slug,
      blog_content1_text,
      thumbnail_image,
      created_at,
      product_category,
      status
    FROM blogs
  `;

  if (status && status !== "all") {
    sql += ` WHERE status = ? `;
  }

  sql += ` ORDER BY created_at DESC `;

  try {
    const [results] = status && status !== "all"
      ? await db.query(sql, [status])
      : await db.query(sql);

      const formatted = results.map(blog => {
        // Logic to prevent double URLs
        let finalImage = null;
        if (blog.thumbnail_image) {
          if (blog.thumbnail_image.startsWith("http")) {
            // It's already a full cloud URL (DigitalOcean), use as is
            finalImage = blog.thumbnail_image;
          } else {
            // It's an old local path (e.g. "uploads/image.jpg"), add backend prefix
            finalImage = `https://euphoria-backend-oii0.onrender.com/${blog.thumbnail_image}`;
          }
        }
  
        return {
          id: blog.id,
          title: blog.blog_title,
          slug: blog.slug,
          excerpt: blog.blog_content1_text
            ? blog.blog_content1_text.substring(0, 150) + "..."
            : "",
          image: finalImage, // Corrected URL
          date: new Date(blog.created_at).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
          category: blog.product_category,
          status: blog.status
        };
      });

    res.json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

app.get("/api/blogs/:slug", async (req, res) => {
  const { slug } = req.params;

  try {
    const sql = `SELECT * FROM blogs WHERE slug = ? LIMIT 1`;
    const [rows] = await db.query(sql, [slug]);

    if (rows.length === 0) {
      return res.status(404).json({ message: "Blog not found" });
    }

    const blog = rows[0];

    // ✅ FIX: No more URL prepending. DigitalOcean provides full URLs.
    // We only use encodeURI if the data exists, but DO URLs are usually already safe.
    const response = {
      ...blog,
      image1: blog.image1 || null,
      image2: blog.image2 || null,
      image3: blog.image3 || null,
      banner_image: blog.banner_image || null,
      thumbnail_image: blog.thumbnail_image || null
    };

    res.json(response);
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// APPROVE / REJECT BLOG
app.patch("/api/blogs/:id/status", async (req, res) => {
  console.log("entered into blog status edit api");
  const { id } = req.params;
  const { status } = req.body;

  if (!["approved", "rejected", "pending"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    await db.query(
      "UPDATE blogs SET status = ? WHERE id = ?",
      [status, id]
    );

    res.json({ message: "Status updated successfully" });
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: "DB error" });
  }
});


// DELETE BLOG
app.delete("/api/blogs/:id", async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "No ID provided" });
  }

  try {
    // 1. Execute delete
    const [result] = await db.query("DELETE FROM blogs WHERE id = ?", [id]);

    // 2. Check if a row was actually deleted
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Blog not found" });
    }

    console.log(`Blog ID ${id} deleted successfully.`);
    res.json({ message: "Blog deleted successfully" });
  } catch (err) {
    console.error("DB Error during delete:", err);
    res.status(500).json({ error: "Internal server error", details: err.message });
  }
});

// EDIT BLOG
// app.put(
//   "/api/blogs/:id",
//   upload.fields([
//     { name: "banner_image" },
//     { name: "thumbnail_image" },
//     { name: "image1" },
//     { name: "image2" },
//     { name: "image3" }
//   ]),
//   async (req, res) => {
//     const { id } = req.params;
//     const data = { ...req.body };

//     delete data.id;

//     // ✅ FIX: convert all blog_content arrays
//     Object.keys(data).forEach(key => {
//       if (key.startsWith("blog_content") && Array.isArray(data[key])) {
//         data[key] = data[key].join("");
//       }
//       if (data[key] === undefined) delete data[key];
//     });

//     if (Object.keys(data).length === 0) {
//       return res.status(400).json({ error: "No valid data provided for update" });
//     }

//     try {
//       await db.query("UPDATE blogs SET ? WHERE id = ?", [data, id]);
//       res.json({ message: "Blog updated successfully" });
//     } catch (err) {
//       console.error("DB Error:", err);
//       res.status(500).json({ error: "DB error" });
//     }
//   }
// );
app.put(
  "/api/blogs/:id",
  upload.fields([
    { name: "banner_image", maxCount: 1 },
    { name: "thumbnail_image", maxCount: 1 },
    { name: "image1", maxCount: 1 },
    { name: "image2", maxCount: 1 },
    { name: "image3", maxCount: 1 },
  ]),
  async (req, res) => {
    const { id } = req.params;
    const data = { ...req.body };
    const files = req.files || {};

    try {
      // 1. Map DigitalOcean URLs ONLY if a new file was actually uploaded
      if (files.banner_image) data.banner_image = files.banner_image[0].location;
      if (files.thumbnail_image) data.thumbnail_image = files.thumbnail_image[0].location;
      if (files.image1) data.image1 = files.image1[0].location;
      if (files.image2) data.image2 = files.image2[0].location;
      if (files.image3) data.image3 = files.image3[0].location;

      // 2. Prevent primary key update
      delete data.id;

      // 3. Robust HTML Stripper
      const stripHtml = (html) => {
        if (!html) return "";
        const str = Array.isArray(html) ? html.join("") : String(html);
        return str.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
      };

      // 4. Process Content & Search Text
      for (let i = 1; i <= 5; i++) {
        const key = `blog_content${i}`;
        if (data[key] !== undefined) {
          const content = Array.isArray(data[key]) ? data[key].join("") : data[key];
          data[key] = content;
          data[`${key}_text`] = stripHtml(content);
        }
      }

      // 5. Update Database
      const [result] = await db.query("UPDATE blogs SET ? WHERE id = ?", [data, id]);

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Blog not found" });
      }

      res.json({ message: "Blog updated successfully in cloud storage" });
    } catch (err) {
      console.error("Update Error:", err);
      res.status(500).json({ error: "Update failed", details: err.message });
    }
  }
);

app.get("/ping", (req, res) => {
  res.send("Server is awake and this api calls the server every 5 minutes");
});

// rss feeds:



const cron = require("node-cron");
const { fetchAndStoreRSS } = require("./rssService");

// fetchAndStoreRSS(db);

// Runs every 30 minutes
// cron.schedule("34 12 * * *", () => {
//   console.log("⏰ Running RSS cron at 12:30...");
//   fetchAndStoreRSS(db);
// });

async function deleteOldFeeds(db) {
  try {
    const query = `
      DELETE FROM rss_blogs 
      WHERE pubDate < DATE_SUB(NOW(), INTERVAL 6 MONTH)
    `;

    const [result] = await db.query(query);

    console.log(`🧹 Deleted ${result.affectedRows} old RSS records`);
  } catch (error) {
    console.error("❌ Error deleting old RSS feeds:", error.message);
  }
}
cron.schedule("0 1 * * *", async () => {
  console.log("🧹 Running cleanup cron at 1:00 AM...");

  try {
    await deleteOldFeeds(db);
    console.log("✅ Cleanup completed");
  } catch (err) {
    console.error("❌ Cleanup cron error:", err.message);
  }
});



app.get("/api/rss-blogs", async (req, res) => {
  try {
    const { category, search } = req.query;

    let query = `
      SELECT id, title, description, content, category, image, link, pubDate
      FROM rss_blogs
      WHERE 1=1
    `;

    const params = [];

    // ✅ Category filter
    if (category && category !== "All") {
      query += " AND category = ?";
      params.push(category);
    }

    // ✅ Search filter
    if (search) {
      query += " AND title LIKE ?";
      params.push(`%${search}%`);
    }

    query += " ORDER BY pubDate DESC";

    const [rows] = await db.query(query, params);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ========== LANDING PAGE REGISTRATION API ==========
// --- Place this ABOVE the app.get(/.*/) route ---

app.post("/api/landing/register", async (req, res) => {
  console.log("📥 Registration Attempt:", req.body); // Debug log

  try {
    const { fname, lname, email } = req.body;

    if (!fname || !lname || !email) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // 1. Check if email exists
    const [existing] = await db.query("SELECT id FROM landing_registrations WHERE email = ?", [email]);
    
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: "This email is already registered!" });
    }

    // 2. Insert into DB
    const sql = `INSERT INTO landing_registrations (first_name, last_name, email) VALUES (?, ?, ?)`;
    await db.query(sql, [fname, lname, email]);

    return res.json({ success: true, message: "Success" });

  } catch (err) {
    console.error("❌ SQL Error:", err);
    return res.status(500).json({ success: false, message: "Database error" });
  }
});




// ========== Global Error Handler ==========
app.use(errorHandler);

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
}); 

app.use(express.static(path.join(__dirname, 'build'))); 



// ========== Start Server ==========

app.listen(3000, "0.0.0.0", () => {
  console.log("🚀 Server running on https://euphoria-backend-oii0.onrender.com");
});
// app.listen(PORT, "0.0.0.0", () => {
//   console.log(`🚀 Server running on http://localhost:${PORT}`);
// });