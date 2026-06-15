const bcrypt = require('bcryptjs');

const password = 'Admin@123';
const hash = bcrypt.hashSync(password, 10);
console.log('HASH:' + hash);

const verify = bcrypt.compareSync(password, hash);
console.log('VERIFY:' + verify);
