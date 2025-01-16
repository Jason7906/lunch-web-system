const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
// 資料庫檔案路徑
const DB_FILE = path.join(__dirname, 'data', 'database.db');

// 確保資料夾存在
if (!fs.existsSync(path.dirname(DB_FILE))) {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
}

// 使用檔案型資料庫
const db = new sqlite3.Database(DB_FILE);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 初始化資料庫
db.serialize(() => {
    db.run(
        `CREATE TABLE IF NOT EXISTS restaurants (
            id INTEGER PRIMARY KEY, 
            name TEXT, 
            weight INTEGER, 
            in_pool INTEGER DEFAULT 0
            votes TEXT DEFAULT '{}'
        )`
    );
    db.run(
        `CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY, 
            name TEXT UNIQUE, 
            weight INTEGER
        )`
    );    

    // 初始化範例餐廳
    db.get("SELECT COUNT(*) AS count FROM restaurants", (err, row) => {
        if (err) throw err;
        if (row.count === 0) {
            const restaurants = [
                { name: '八方雲集', weight: 10, in_pool: 1},
                { name: 'Costco', weight: 10, in_pool: 1 },
                { name: '麥當勞', weight: 10, in_pool: 1 },
                { name: '冰店', weight: 10, in_pool: 1 },
                { name: '早餐店', weight: 10, in_pool: 1 },
                { name: '阿忠', weight: 10, in_pool: 1 },
                { name: 'Subway', weight: 10, in_pool: 1 },
                { name: '水餃店', weight: 10, in_pool: 1 },
                { name: '牛肉麵', weight: 10, in_pool: 1 },
                { name: '鵝肉拉麵', weight: 10, in_pool: 1 },
                { name: '黃悶雞', weight: 10, in_pool: 1 },
                { name: '擔擔麵', weight: 10, in_pool: 1 },
                { name: '築間火鍋', weight: 1, in_pool: 1 }, // 特別設置火鍋的 weight 為 1
                { name: 'bonita', weight: 1, in_pool: 1 },
                { name: '日式咖哩', weight: 10, in_pool: 1 },
                { name: '快快井', weight: 10, in_pool: 1 },
                { name: 'Edwin Eats', weight: 1, in_pool: 1 },
                { name: '晴光意麵', weight: 10, in_pool: 1 },
                // { name: '南洋鍋', weight: 0.1, in_pool: 1 },
            ];
    
            const stmt = db.prepare("INSERT INTO restaurants (name, weight, in_pool, votes) VALUES (?, ?, ?,?)");
            restaurants.forEach(({ name, weight, in_pool }) => stmt.run(name, weight, in_pool));
            stmt.finalize();
        }
    });
});
// 返回在pool的餐廳
app.get('/restaurants/pool', (req, res) => {
    db.all("SELECT * FROM restaurants WHERE in_pool = 1", (err, rows) => {
        if (err) return res.status(500).send(err.message);
        res.json(rows);
    });
});
// 更新餐廳是否進入轉盤
app.put('/restaurants/:id/pool', (req, res) => {
    const { id } = req.params;
    const { in_pool } = req.body;

    if (in_pool === undefined || ![0, 1].includes(in_pool)) {
        return res.status(400).send('請提供有效的 in_pool 值 (0 或 1)');
    }

    db.run(
        "UPDATE restaurants SET in_pool = ?, weight = CASE WHEN ? = 1 THEN 10 ELSE weight END WHERE id = ?",
        [in_pool, in_pool, id],
        function (err) {
            if (err) return res.status(500).send(err.message);
            res.send(`餐廳狀態已更新為 ${in_pool === 1 ? '加入轉盤' : '移出轉盤'}`);
        }
    );
});

// 取得餐廳列表
app.get('/restaurants', (req, res) => {
    const { in_pool } = req.query;
    let query = "SELECT * FROM restaurants";
    const params = [];

    if (in_pool !== undefined) {
        query += " WHERE in_pool = ?";
        params.push(Number(in_pool));
    }

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).send(err.message);
        res.json(rows);
    });
});

// 使用者登入
app.post('/login', (req, res) => {
    const { name } = req.body;
    // 限制僅允許指定名稱登入
    const allowedNames = ['Jason','Edwin','Mark','William','Eric','Landy']; // 允許登入的名稱列表
    const isAllowed = allowedNames.some(
        allowedName => allowedName.toLowerCase() === name.toLowerCase()
    );

    if (!isAllowed) {
        return res.status(403).send('您無權登入此系統');
    }
    const lowerCaseName = name.toLowerCase(); // 將名字轉為小寫

    db.get("SELECT * FROM users WHERE name = ?", [lowerCaseName], (err, user) => {
        if (err) {
            console.error("資料庫查詢錯誤:", err);
            return res.status(500).send(err.message);
        }
        if (user) {   
            res.json(user);
        } else {
            // 新增用戶並初始化權重
            db.run("INSERT INTO users (name, weight) VALUES (?, 10)", [lowerCaseName], function (err) {
                if (err) {
                    console.error("插入用戶失敗:", err);
                    return res.status(500).send(err.message);
                }
                res.json({ id: this.lastID, name, weight: 10 });
            });
        }
    });
});
// 取得使用者剩餘權重
app.get('/users/:id/weight', (req, res) => {
    const { id } = req.params;
    db.get("SELECT weight FROM users WHERE id = ?", [id], (err, row) => {
        if (err) return res.status(500).send(err.message);
        if (!row) return res.status(404).send('用戶不存在');
        res.json({ weight: row.weight });
    });
});
// 投票功能
app.post('/vote', (req, res) => {
    const { userId, restaurantId, voteWeight } = req.body;

    db.get("SELECT weight FROM users WHERE id = ?", [userId], (err, user) => {
        if (err) return res.status(500).send(err.message);

        // 如果用戶權重為 0，禁止投票
        if (!user || user.weight <= 0) {
            return res.status(400).send('權重已耗盡，無法投票');
        }

        db.get("SELECT in_pool FROM restaurants WHERE id = ?", [restaurantId], (err, restaurant) => {
            if (err) return res.status(500).send(err.message);
            if (!restaurant || restaurant.in_pool === 0) {
                return res.status(400).send('該餐廳未在轉盤池中');
            }

            if (user.weight < voteWeight) {
                return res.status(400).send('權重不足');
            }

            // 更新用戶的權重
            db.run("UPDATE users SET weight = weight - ? WHERE id = ?", [voteWeight, userId], (err) => {
                if (err) return res.status(500).send(err.message);

                // 更新餐廳的總權重
                db.run("UPDATE restaurants SET weight = weight + ? WHERE id = ?", [voteWeight, restaurantId], (err) => {
                    if (err) return res.status(500).send(err.message);

                    // 更新餐廳的 votes 欄位
                    const currentVotes = JSON.parse(restaurant.votes || '{}');
                    const userKey = `user_${userId}`;
                    currentVotes[userKey] = (currentVotes[userKey] || 0) + voteWeight;

                    db.run(
                        "UPDATE restaurants SET votes = ? WHERE id = ?",
                        [JSON.stringify(currentVotes), restaurantId],
                        (err) => {
                            if (err) return res.status(500).send(err.message);
                            res.send('投票成功');
                        }
                    );
                });
            });
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
app.post('/restaurants/pool', (req, res) => {
    const { restaurantIds, inPool } = req.body;

    if (!Array.isArray(restaurantIds) || restaurantIds.length === 0) {
        return res.status(400).send('請提供有效的餐廳 ID 陣列');
    }

    if (typeof inPool !== 'boolean') {
        return res.status(400).send('請提供有效的 inPool 布林值');
    }

    const placeholders = restaurantIds.map(() => '?').join(', ');
    const updateWeight = inPool ? ', weight = 10' : '';
    const query = `UPDATE restaurants SET in_pool = ?${updateWeight} WHERE id IN (${placeholders})`;
    const params = [inPool ? 1 : 0, ...restaurantIds];

    db.run(query, params, function (err) {
        if (err) return res.status(500).send(err.message);
        res.json({
            message: `餐廳已成功${inPool ? '加入' : '移出'} pool`,
            affectedRows: this.changes
        });
    });
});


// 啟動伺服器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`伺服器運行在 http://localhost:${PORT}`);
});
