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
        )`
    );
    db.run(
        `CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY, 
            name TEXT UNIQUE, 
            weight INTEGER
        )`
    );
    // 投票紀錄用表
    db.run(
        `CREATE TABLE IF NOT EXISTS votes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            restaurant_id INTEGER NOT NULL,
            vote_weight INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
        )`
    );

    // 初始化範例餐廳
    db.get("SELECT COUNT(*) AS count FROM restaurants", (err, row) => {
        if (err) throw err;
        if (row.count === 0) {
            const restaurants = [
                { name: '八方雲集', weight: 10, in_pool: 1 },
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
    
            const stmt = db.prepare("INSERT INTO restaurants (name, weight, in_pool) VALUES (?, ?, ?)");
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
    let query = `
        SELECT 
            r.id,
            r.name,
            r.weight,
            r.in_pool,
            COALESCE(JSON_GROUP_ARRAY(
                JSON_OBJECT(
                    'name', u.name,
                    'vote_weight', v.vote_weight
                )
            ), '[]') AS votes
        FROM 
            restaurants r
        LEFT JOIN votes v ON r.id = v.restaurant_id
        LEFT JOIN users u ON v.user_id = u.id
    `;
    const params = [];

    if (in_pool !== undefined) {
        if (isNaN(in_pool)) {
            return res.status(400).send("in_pool 必須是一個數字");
        }
        query += " WHERE r.in_pool = ?";
        params.push(Number(in_pool));
    }

    query += " GROUP BY r.id";

    db.all(query, params, (err, rows) => {
        if (err) {
            console.error("取得餐廳列表失敗:", err);
            return res.status(500).send("伺服器錯誤");
        }

        // 將每間餐廳的投票資料轉換為 JSON 格式
        rows.forEach(row => {
            // 過濾掉無效的投票記錄
            row.votes = JSON.parse(row.votes).filter(v => v.name && v.vote_weight !== null);
        });

        res.json(rows);
    });
});

// 使用者登入
app.post('/login', (req, res) => {
    const { name } = req.body;
    // 限制僅允許指定名稱登入
    const allowedNames = ['Jason','Edwin','Mark','William','Eric','Landy']; // 允許登入的名稱列表
    const normalizedName = name.toLowerCase(); // 強制轉換為小寫
    const isAllowed = allowedNames.some(
        allowedName => allowedName.toLowerCase() === normalizedName
    );

    if (!isAllowed) {
        return res.status(403).send('您無權登入此系統');
    }


    db.get("SELECT * FROM users WHERE name = ?", [normalizedName], (err, user) => {
        if (err) {
            console.error("資料庫查詢錯誤:", err);
            return res.status(500).send(err.message);
        }
        if (user) {   
            res.json(user);
        } else {
            // 新增用戶並初始化權重
            db.run("INSERT INTO users (name, weight) VALUES (?, 10)", [normalizedName], function (err) {
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
app.post('/vote', async (req, res) => {
    const votesArray = req.body;

    if (!Array.isArray(votesArray)) {
        return res.status(400).send('無效的資料格式');
    }

    const dbRunAsync = (sql, params) =>
        new Promise((resolve, reject) => {
            db.run(sql, params, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

    const dbGetAsync = (sql, params) =>
        new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

    try {
        // 開始交易
        await dbRunAsync('BEGIN TRANSACTION');

        for (const { userId, restaurantId, voteWeight } of votesArray) {
            // 驗證使用者權重
            const user = await dbGetAsync("SELECT weight FROM users WHERE id = ?", [userId]);
            if (!user || user.weight <= 0 || user.weight < voteWeight) {
                throw new Error('權重不足或無效的使用者');
            }

            // 驗證餐廳是否在轉盤池中
            const restaurant = await dbGetAsync("SELECT in_pool FROM restaurants WHERE id = ?", [restaurantId]);
            if (!restaurant || restaurant.in_pool === 0) {
                throw new Error('該餐廳未在轉盤池中');
            }

            // 更新使用者權重
            await dbRunAsync("UPDATE users SET weight = weight - ? WHERE id = ?", [voteWeight, userId]);

            // 更新餐廳權重
            await dbRunAsync("UPDATE restaurants SET weight = weight + ? WHERE id = ?", [voteWeight, restaurantId]);

            // 插入或更新 votes 表
            const existingVote = await dbGetAsync(
                "SELECT id, vote_weight FROM votes WHERE user_id = ? AND restaurant_id = ?",
                [userId, restaurantId]
            );
            if (existingVote) {
                await dbRunAsync(
                    "UPDATE votes SET vote_weight = vote_weight + ? WHERE id = ?",
                    [voteWeight, existingVote.id]
                );
            } else {
                await dbRunAsync(
                    "INSERT INTO votes (user_id, restaurant_id, vote_weight) VALUES (?, ?, ?)",
                    [userId, restaurantId, voteWeight]
                );
            }
        }

        // 提交交易
        await dbRunAsync('COMMIT');
        res.send('批量投票成功');
    } catch (error) {
        // 出現錯誤時回滾交易
        await dbRunAsync('ROLLBACK');
        res.status(500).send(error.message);
    }
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
