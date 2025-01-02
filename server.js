const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const db = new sqlite3.Database(':memory:'); // 使用內存資料庫

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 初始化資料庫
db.serialize(() => {
    db.run("CREATE TABLE restaurants (id INTEGER PRIMARY KEY, name TEXT, weight INTEGER)");
    db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, weight INTEGER)");

    // 預設餐廳資料
    const restaurants = ['餐廳A', '餐廳B', '餐廳C', '餐廳D'];
    const stmt = db.prepare("INSERT INTO restaurants (name, weight) VALUES (?, 10)");
    restaurants.forEach(name => stmt.run(name));
    stmt.finalize();
});

// 取得餐廳列表
app.get('/restaurants', (req, res) => {
    db.all("SELECT * FROM restaurants", (err, rows) => {
        if (err) return res.status(500).send(err.message);
        res.json(rows);
    });
});

// 使用者登入
app.post('/login', (req, res) => {
    const { name } = req.body;
    db.get("SELECT * FROM users WHERE name = ?", [name], (err, user) => {
        if (err) return res.status(500).send(err.message);

        if (user) {
            res.json(user);
        } else {
            db.run("INSERT INTO users (name, weight) VALUES (?, 10)", [name], function(err) {
                if (err) return res.status(500).send(err.message);
                res.json({ id: this.lastID, name, weight: 10 });
            });
        }
    });
});

// 投票功能
app.post('/vote', (req, res) => {
    const { userId, restaurantId, voteWeight } = req.body;
    db.get("SELECT weight FROM users WHERE id = ?", [userId], (err, user) => {
        if (err) return res.status(500).send(err.message);
        if (!user || user.weight < voteWeight) {
            return res.status(400).send('權重不足');
        }

        db.run("UPDATE users SET weight = weight - ? WHERE id = ?", [voteWeight, userId]);
        db.run("UPDATE restaurants SET weight = weight + ? WHERE id = ?", [voteWeight, restaurantId], (err) => {
            if (err) return res.status(500).send(err.message);
            res.send('投票成功');
        });
    });
});
// 新增餐廳
app.post('/restaurants', (req, res) => {
    const { name, weight } = req.body;
    if (!name || weight === undefined) {
        return res.status(400).send('請提供餐廳名稱和權重');
    }
    db.run("INSERT INTO restaurants (name, weight) VALUES (?, ?)", [name, weight], function (err) {
        if (err) return res.status(500).send(err.message);
        res.json({ id: this.lastID, name, weight });
    });
});

// 刪除餐廳
app.delete('/restaurants/:id', (req, res) => {
    const { id } = req.params;
    db.run("DELETE FROM restaurants WHERE id = ?", [id], function (err) {
        if (err) return res.status(500).send(err.message);
        res.send('餐廳刪除成功');
    });
});
// 更新餐廳列表
function updateRestaurantsList() {
    const list = document.getElementById('restaurantsList');
    list.innerHTML = restaurants.map(r => `
        <div class="restaurant">
            <span>${r.name} - 權重: ${r.weight}</span>
            <div>
                <button onclick="adjustVote(${r.id}, -1)">-</button>
                <span>${votes[r.id] || 0}</span>
                <button onclick="adjustVote(${r.id}, 1)">+</button>
            </div>
        </div>
    `).join('');
}
// 修改餐廳名稱
app.put('/restaurants/:id', (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) {
        return res.status(400).send('請提供新的餐廳名稱');
    }
    db.run("UPDATE restaurants SET name = ? WHERE id = ?", [name, id], function (err) {
        if (err) return res.status(500).send(err.message);
        res.send('餐廳名稱修改成功');
    });
});
// 啟動伺服器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`伺服器運行在 http://localhost:${PORT}`);
});
