const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const db = require('./db');

const app = express();
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'tvu_tinh_nguyen_2026',
    resave: false,
    saveUninitialized: true
}));

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// 1. TRANG CHỦ: Hiển thị, tìm kiếm và lọc hoạt động
app.get('/', (req, res) => {
    const { q, don_vi_id } = req.query;
    let sql = `
        SELECT hoat_dong.*, don_vi.ten_don_vi,
        (SELECT COUNT(*) FROM dang_ky WHERE dang_ky.hoat_dong_id = hoat_dong.id AND trang_thai_duyet != 'tu_choi') AS da_dang_ky
        FROM hoat_dong
        LEFT JOIN don_vi ON hoat_dong.don_vi_id = don_vi.id
        WHERE 1=1
    `;
    const params = [];

    if (q) {
        sql += ` AND (hoat_dong.tieu_de LIKE ? OR hoat_dong.dia_diem LIKE ?)`;
        params.push(`%${q}%`, `%${q}%`);
    }
    if (don_vi_id) {
        sql += ` AND hoat_dong.don_vi_id = ?`;
        params.push(don_vi_id);
    }
    sql += ` ORDER BY hoat_dong.id DESC`;

    db.query(sql, params, (err, hoatDongs) => {
        if (err) throw err;
        db.query('SELECT * FROM don_vi', (err2, donVis) => {
            if (err2) throw err2;
            if (req.session.user) {
                db.query('SELECT hoat_dong_id FROM dang_ky WHERE user_id = ?', [req.session.user.id], (err3, daDk) => {
                    const registeredIds = daDk.map(item => item.hoat_dong_id);
                    res.render('index', { hoatDongs, donVis, q: q || '', don_vi_id: don_vi_id || '', registeredIds });
                });
            } else {
                res.render('index', { hoatDongs, donVis, q: q || '', don_vi_id: don_vi_id || '', registeredIds: [] });
            }
        });
    });
});

// 2. ĐĂNG NHẬP & ĐĂNG KÝ TÀI KHOẢN
app.get('/login', (req, res) => {
    res.render('login', { error: null, success: null });
});

app.post('/login', (req, res) => {
    const { mssv, mat_khau } = req.body;
    db.query('SELECT * FROM users WHERE mssv = ? AND mat_khau = ?', [mssv, mat_khau], (err, results) => {
        if (err) throw err;
        if (results.length > 0) {
            req.session.user = results[0];
            if (results[0].vai_tro === 'admin') return res.redirect('/admin');
            return res.redirect('/');
        } else {
            res.render('login', { error: 'Sai MSSV hoặc mật khẩu!', success: null });
        }
    });
});

app.post('/register', (req, res) => {
    const { mssv, ho_ten, lop, email, sdt, mat_khau } = req.body;
    db.query('SELECT * FROM users WHERE mssv = ?', [mssv], (err, exists) => {
        if (exists.length > 0) {
            return res.render('login', { error: 'MSSV này đã tồn tại trên hệ thống!', success: null });
        }
        const sql = 'INSERT INTO users (mssv, ho_ten, lop, email, sdt, mat_khau, vai_tro) VALUES (?, ?, ?, ?, ?, ?, "sinh_vien")';
        db.query(sql, [mssv, ho_ten, lop, email, sdt, mat_khau], (err2) => {
            if (err2) throw err2;
            res.render('login', { error: null, success: 'Đăng ký tài khoản thành công! Vui lòng đăng nhập.' });
        });
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// 3. SINH VIÊN ĐĂNG KÝ HOẠT ĐỘNG & XEM LỊCH SỬ
app.post('/dang-ky/:id', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const userId = req.session.user.id;
    const hoatDongId = req.params.id;

    db.query('SELECT * FROM dang_ky WHERE user_id = ? AND hoat_dong_id = ?', [userId, hoatDongId], (err, rows) => {
        if (rows.length > 0) return res.redirect('/');
        db.query('INSERT INTO dang_ky (user_id, hoat_dong_id) VALUES (?, ?)', [userId, hoatDongId], (err2) => {
            if (err2) throw err2;
            res.redirect('/lich-su');
        });
    });
});

app.get('/lich-su', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const sql = `
        SELECT dang_ky.*, hoat_dong.tieu_de, hoat_dong.thoi_gian_bat_dau, hoat_dong.dia_diem, don_vi.ten_don_vi
        FROM dang_ky
        JOIN hoat_dong ON dang_ky.hoat_dong_id = hoat_dong.id
        LEFT JOIN don_vi ON hoat_dong.don_vi_id = don_vi.id
        WHERE dang_ky.user_id = ?
        ORDER BY dang_ky.ngay_dang_ky DESC
    `;
    db.query(sql, [req.session.user.id], (err, lichSu) => {
        if (err) throw err;
        res.render('lich_su', { lichSu });
    });
});

app.post('/huy-dang-ky/:id', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    db.query('DELETE FROM dang_ky WHERE id = ? AND user_id = ? AND trang_thai_duyet = "cho_duyet"', [req.params.id, req.session.user.id], () => {
        res.redirect('/lich-su');
    });
});

// 4. TRANG QUẢN TRỊ (ADMIN)
app.get('/admin', (req, res) => {
    if (!req.session.user || req.session.user.vai_tro !== 'admin') return res.redirect('/login');
    
    const sqlHd = `
        SELECT hoat_dong.*, don_vi.ten_don_vi,
        (SELECT COUNT(*) FROM dang_ky WHERE dang_ky.hoat_dong_id = hoat_dong.id AND trang_thai_duyet != 'tu_choi') AS da_dang_ky
        FROM hoat_dong LEFT JOIN don_vi ON hoat_dong.don_vi_id = don_vi.id ORDER BY hoat_dong.id DESC
    `;
    const sqlDk = `
        SELECT dang_ky.*, users.mssv, users.ho_ten, users.lop, users.sdt, hoat_dong.tieu_de
        FROM dang_ky
        JOIN users ON dang_ky.user_id = users.id
        JOIN hoat_dong ON dang_ky.hoat_dong_id = hoat_dong.id
        ORDER BY dang_ky.ngay_dang_ky DESC
    `;

    db.query(sqlHd, (err, hoatDongs) => {
        db.query('SELECT * FROM don_vi', (err2, donVis) => {
            db.query(sqlDk, (err3, danhSachDk) => {
                res.render('admin', { hoatDongs, donVis, danhSachDk });
            });
        });
    });
});

app.post('/admin/hoat-dong/them', (req, res) => {
    if (!req.session.user || req.session.user.vai_tro !== 'admin') return res.redirect('/login');
    const { don_vi_id, tieu_de, mo_ta, thoi_gian_bat_dau, dia_diem, so_luong_toi_da, yeu_cau } = req.body;
    const sql = 'INSERT INTO hoat_dong (don_vi_id, tieu_de, mo_ta, thoi_gian_bat_dau, dia_diem, so_luong_toi_da, yeu_cau) VALUES (?, ?, ?, ?, ?, ?, ?)';
    db.query(sql, [don_vi_id, tieu_de, mo_ta, thoi_gian_bat_dau, dia_diem, so_luong_toi_da, yeu_cau], () => {
        res.redirect('/admin');
    });
});

app.post('/admin/hoat-dong/xoa/:id', (req, res) => {
    if (!req.session.user || req.session.user.vai_tro !== 'admin') return res.redirect('/login');
    db.query('DELETE FROM hoat_dong WHERE id = ?', [req.params.id], () => {
        res.redirect('/admin');
    });
});

app.post('/admin/dang-ky/cap-nhat/:id', (req, res) => {
    if (!req.session.user || req.session.user.vai_tro !== 'admin') return res.redirect('/login');
    const { trang_thai_duyet, ket_qua } = req.body;
    db.query('UPDATE dang_ky SET trang_thai_duyet = ?, ket_qua = ? WHERE id = ?', [trang_thai_duyet, ket_qua, req.params.id], () => {
        res.redirect('/admin');
    });
});

app.get('/admin/xuat-excel', (req, res) => {
    if (!req.session.user || req.session.user.vai_tro !== 'admin') return res.redirect('/login');
    const sql = `
        SELECT users.mssv, users.ho_ten, users.lop, users.sdt, hoat_dong.tieu_de, dang_ky.trang_thai_duyet, dang_ky.ket_qua
        FROM dang_ky
        JOIN users ON dang_ky.user_id = users.id
        JOIN hoat_dong ON dang_ky.hoat_dong_id = hoat_dong.id
    `;
    db.query(sql, (err, rows) => {
        let csv = '\uFEFFMSSV,Họ và tên,Lớp,Số điện thoại,Hoạt động tình nguyện,Trạng thái duyệt,Kết quả tham gia\n';
        rows.forEach(r => {
            csv += `"${r.mssv}","${r.ho_ten}","${r.lop}","${r.sdt}","${r.tieu_de}","${r.trang_thai_duyet}","${r.ket_qua}"\n`;
        });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=Danh_Sach_Tinh_Nguyen_TVU.csv');
        res.send(csv);
    });
});

app.listen(3000, () => {
    console.log('🚀 Website đang chạy tại: http://localhost:3000');
});