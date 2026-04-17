const axios = require("axios");
const xml2js = require("xml2js");

const RSS_FEEDS = [
  {
    url: "https://www.psychologicalscience.org/feed",
    source: "APS"
  },
  {
    url: "https://www.calmsage.com/feed/",
    source: "CalmSage"
  },
  {
    url: "https://www.goodtherapy.org/blog/feed/",
    source: "GoodTherapy"
  },
  {
    url: "https://www.nationalelfservice.net/mental-health/feed/",
    source: "NationalelfService"
  },
  {
    url: "https://tinybuddha.com/feed/",
    source: "TinyBuddha"
  },
  {
    url: "https://www.spring.org.uk/feed",
    source: "Spring"
  }
];

const allowedCategories = [
  "Abuse",
  "Regulation",
  "Sex and relationship",
  "ADHD",
  "Diet and nutrition",
  "Personality disorder",
  "Trauma",
  "Therapy",
  "Stress and anxiety",
  "Health",
  "Child development",
  "Cognition",
  "Grief",
  "Mental health"
];

const titleCategoryMapping = {
  "Abuse": ["abuse", "violence", "harassment"],
  "Regulation": ["self-control", "regulation", "discipline", "control"],
  "Sex and relationship": ["sex", "relationship", "marriage", "couple", "dating"],
  "ADHD": ["adhd", "attention deficit", "hyperactivity"],
  "Diet and nutrition": ["diet", "nutrition", "food", "eating"],
  "Personality disorder": ["personality disorder", "narcissism", "bpd"],
  "Trauma": ["trauma", "ptsd"],
  "Therapy": ["therapy", "counseling", "treatment"],
  "Stress and anxiety": ["stress", "anxiety", "fear", "worry"],
  "Health": ["health", "wellbeing", "fitness"],
  "Child development": ["child", "kids", "parent", "development"],
  "Cognition": ["brain", "mind", "memory", "thinking", "perception"],
  "Grief": ["grief", "loss", "mourning"]
};

function extractImage(content) {
  if (!content) return null;
  const match = content.match(/<img.*?src="(.*?)"/);
  return match ? match[1] : null;
}

function getCategoryFromTitle(title) {
  if (!title) return "Mental health";

  const cleanTitle = title.toLowerCase();

  for (const [category, keywords] of Object.entries(titleCategoryMapping)) {
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, "i");
      if (regex.test(cleanTitle)) {
        return category;
      }
    }
  }

  return "Mental health";
}

async function fetchAndStoreRSS(db) {
  try {
    for (const feed of RSS_FEEDS) {
      console.log(`Fetching RSS: ${feed.url}`);

      const response = await axios.get(feed.url, {
        timeout: 15000,
        headers: { "User-Agent": "Mozilla/5.0" }
      });

      let result;
      try {
        result = await xml2js.parseStringPromise(response.data);
      } catch (err) {
        console.error("XML Parse Error:", err.message);
        continue;
      }

      const items = result?.rss?.channel?.[0]?.item || [];

      console.log(`Total items from ${feed.source}:`, items.length);

      for (const item of items) {
        try {
          const title = item.title?.[0] || "";
          const link = item.link?.[0] || "";
          const description = item.description?.[0] || "";
          const content = item["content:encoded"]?.[0] || "";
          const pubDate = item.pubDate?.[0]
            ? new Date(item.pubDate[0])
            : new Date();

          const image = extractImage(content);

          let category = getCategoryFromTitle(title);

          if (!allowedCategories.includes(category)) {
            category = "Mental health";
          }

          await db.query(
            `INSERT IGNORE INTO rss_blogs 
            (title, link, description, content, pubDate, category, image, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              title,
              link,
              description,
              content,
              pubDate,
              category,
              image,
              feed.source
            ]
          );

        } catch (err) {
          console.error("DB ERROR:", err.message);
        }
      }
    }

    console.log("✅ All RSS feeds synced");

  } catch (err) {
    console.error("RSS Fetch Error:", err.message);
  }
}

module.exports = { fetchAndStoreRSS };