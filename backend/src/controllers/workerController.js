const Worker = require('../models/Worker');
const { asyncHandler } = require('../middleware/errorHandler');
const { ApiError } = require('../middleware/errorHandler');

// Get workers for a site
const getWorkers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, status } = req.query;

  const query = { site: req.params.siteId };
  if (status) query.status = status;

  const workers = await Worker.find(query)
    .sort({ joiningDate: -1 })
    .skip((parseInt(page) - 1) * parseInt(limit))
    .limit(parseInt(limit));

  const total = await Worker.countDocuments(query);

  res.status(200).json({
    success: true,
    data: {
      workers,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    },
  });
});

// Create worker
const createWorker = asyncHandler(async (req, res) => {
  const {
    name, mobile, workerType, isContractWorker, dailyWage, contractAmount,
    joiningDate, address, aadharNumber, notes,
  } = req.body;

  if (!name || !mobile || !workerType) {
    throw new ApiError('Name, mobile, and worker type are required', 400);
  }

  if (!mobile.match(/^\d{10}$/)) {
    throw new ApiError('Please enter a valid 10-digit mobile number', 400);
  }

  const worker = new Worker({
    site: req.params.siteId,
    engineer: req.userId,
    name,
    mobile,
    workerType,
    isContractWorker: isContractWorker || false,
    dailyWage: dailyWage || 0,
    contractAmount: contractAmount || 0,
    joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
    address: address || '',
    aadharNumber: aadharNumber || '',
    notes: notes || '',
  });

  await worker.save();

  res.status(201).json({
    success: true,
    data: worker,
    message: 'Worker added successfully',
  });
});

// Update worker
const updateWorker = asyncHandler(async (req, res) => {
  const worker = await Worker.findById(req.params.id);

  if (!worker) {
    throw new ApiError('Worker not found', 404);
  }

  if (worker.site.toString() !== req.params.siteId) {
    throw new ApiError('Unauthorized access', 403);
  }

  const {
    name, mobile, workerType, isContractWorker, dailyWage, contractAmount,
    joiningDate, address, aadharNumber, status, notes,
  } = req.body;

  if (name) worker.name = name;
  if (mobile) worker.mobile = mobile;
  if (workerType) worker.workerType = workerType;
  if (isContractWorker !== undefined) worker.isContractWorker = isContractWorker;
  if (dailyWage !== undefined) worker.dailyWage = dailyWage;
  if (contractAmount !== undefined) worker.contractAmount = contractAmount;
  if (joiningDate !== undefined) worker.joiningDate = joiningDate ? new Date(joiningDate) : worker.joiningDate;
  if (address !== undefined) worker.address = address;
  if (aadharNumber !== undefined) worker.aadharNumber = aadharNumber;
  if (status) worker.status = status;
  if (notes !== undefined) worker.notes = notes;

  await worker.save();

  res.status(200).json({
    success: true,
    data: worker,
    message: 'Worker updated successfully',
  });
});

// Delete worker
const deleteWorker = asyncHandler(async (req, res) => {
  const worker = await Worker.findById(req.params.id);

  if (!worker) {
    throw new ApiError('Worker not found', 404);
  }

  if (worker.site.toString() !== req.params.siteId) {
    throw new ApiError('Unauthorized access', 403);
  }

  await worker.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Worker deleted successfully',
  });
});

module.exports = { getWorkers, createWorker, updateWorker, deleteWorker };
