const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());

// 初始化資料庫
const db = new sqlite3.Database(':memory:');

// 建立資料表
db.serialize(() => {
    db.run("CREATE TABLE restaurants (id INTEGER PRIMARY KEY, name TEXT, weight INTEGER)");
    db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, weight INTEGER)");
    
    // 預設餐廳資料
    const restaurants = ['餐廳A', '餐廳B', '餐廳C', '餐廳D'];
    const stmt = db.prepare("INSERT INTO restaurants (name, weight) VALUES (?, 10)");
    restaurants.forEach(name => stmt.run(name));
    stmt.finalize();
});

// 取得所有餐廳資料
app.get('/restaurants', (req, res) => {
    db.all("SELECT * FROM restaurants", (err, rows) => {
        if (err) return res.status(500).send(err.message);
        res.json(rows);
    });
});

// 使用者登入
app.post('/login', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).send('名字不能為空');

    db.get("SELECT * FROM users WHERE name = ?", [name], (err, user) => {
        if (err) return res.status(500).send(err.message);
        
        if (user) {
            res.json(user);
        } else {
            db.run("INSERT INTO users (name, weight) VALUES (?, 10)", [name], function (err) {
                if (err) return res.status(500).send(err.message);
                res.json({ id: this.lastID, name, weight: 10 });
            });
        }
    });
});

// 投票給餐廳
app.post('/vote', (req, res) => {
    const { userId, restaurantId, voteWeight } = req.body;
    if (!userId || !restaurantId || !voteWeight) {
        return res.status(400).send('請提供完整的投票資訊');
    }

    db.serialize(() => {
        // 檢查使用者是否有足夠權重
        db.get("SELECT weight FROM users WHERE id = ?", [userId], (err, user) => {
            if (err) return res.status(500).send(err.message);
            if (!user || user.weight < voteWeight) {
                return res.status(400).send('權重不足');
            }

            // 更新使用者權重
            db.run("UPDATE users SET weight = weight - ? WHERE id = ?", [voteWeight, userId]);

            // 更新餐廳權重
            db.run("UPDATE restaurants SET weight = weight + ? WHERE id = ?", [voteWeight, restaurantId], (err) => {
                if (err) return res.status(500).send(err.message);
                res.send('投票成功');
            });
        });
    });
});

// 每日重置權重
setInterval(() => {
    db.run("UPDATE restaurants SET weight = 10");
    console.log("餐廳權重已重置");
}, 24 * 60 * 60 * 1000); // 每日重置

// 啟動伺服器
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`伺服器運行在 http://localhost:${PORT}`);
});
