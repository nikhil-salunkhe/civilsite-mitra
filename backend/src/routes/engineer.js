const express = require('express');
const router = express.Router();
const { getGlobalRecords } = require('../controllers/engineerController');
const { auth, authorize } = require('../middleware/auth');
const { USER_ROLES } = require('../config/constants');

// Global cross-site lists for the engineer sidebar (Workers, Materials,
// Vendors, Expenses, Activities, Documents). Engineer role only.
router.use(auth);
router.use(authorize(USER_ROLES.ENGINEER));

router.get('/:module', getGlobalRecords);

module.exports = router;