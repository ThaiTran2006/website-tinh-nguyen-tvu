const mysql = require('mysql2');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'tinh_nguyen_tvu'
});

connection.connect((err) => {
    if (err) {
        console.error('❌ Lỗi kết nối MySQL:', err.message);
        return;
    }
    console.log('✅ Đã kết nối thành công với MySQL (tinh_nguyen_tvu)!');
});

module.exports = connection;