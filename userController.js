const {
  getUserModel,
  getAppointmentModel,
  getAIAnalysisModel,
  getReportModel,
} = require("../utils/modelHelper.js");

const cache = {
  store: {},

  set(key, value, ttlMs = 5 * 60 * 1000) {
    this.store[key] = {
      value,
      expiresAt: Date.now() + ttlMs,
    };
  },

  get(key) {
    const entry = this.store[key];
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      delete this.store[key];
      return null;
    }
    return entry.value;
  },

  invalidate(key) {
    delete this.store[key];
  },

  invalidateAll() {
    this.store = {};
  },
};

const getUsers = async (req, res, next) => {
  try {
    const { role, search } = req.query;
    const User = getUserModel();
    let query = {};

    if (role) {
      query.role = role;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    let users = await User.find(query);

    // Remove passwords and sort
    users = users.map((u) => {
      const { password, ...userWithoutPassword } = u;
      return userWithoutPassword;
    });

    users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    users = users.slice(0, 100);

    res.json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    next(error);
  }
};

const getUserById = async (req, res, next) => {
  try {
    const User = getUserModel();
    let user = await User.findById(req.params.id);

    // Remove password
    if (user && user.password) {
      const { password, ...userWithoutPassword } = user;
      user = userWithoutPassword;
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const allowedUpdates = [
      "name",
      "phone",
      "dateOfBirth",
      "address",
      "specialization",
      "licenseNumber",
      "bloodGroup",
      "emergencyContact",
      "isActive",
      "role",
    ];
    const updates = Object.keys(req.body);
    const isValidOperation = updates.every((update) =>
      allowedUpdates.includes(update),
    );

    if (!isValidOperation) {
      return res.status(400).json({ message: "Invalid updates" });
    }

    const User = getUserModel();
    let user = await User.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    // Remove password
    if (user && user.password) {
      const { password, ...userWithoutPassword } = user;
      user = userWithoutPassword;
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Don't allow self-deletion
    if (id === req.user.id) {
      return res
        .status(400)
        .json({ message: "Cannot delete your own account" });
    }

    const User = getUserModel();
    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Invalidate stats cache since user count changed
    cache.invalidateAll();

    res.json({
      success: true,
      message: "User deleted",
    });
  } catch (error) {
    next(error);
  }
};

const invalidateStatsCache = () => cache.invalidateAll();

const getDashboardStats = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    // Cache key is unique per user
    const cacheKey = `stats:${userId}`;

    // Return cached result if still valid
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        stats: cached,
        fromCache: true,
      });
    }

    const User = getUserModel();
    const Appointment = getAppointmentModel();
    const AIAnalysis = getAIAnalysisModel();
    const Report = getReportModel();

    let stats = {};

    if (role === "admin") {
      const [
        totalUsers,
        totalPatients,
        totalDoctors,
        totalAppointments,
        totalAnalyses,
        pendingAppointments,
      ] = await Promise.all([
        User.countDocuments({}),
        User.countDocuments({ role: "patient" }),
        User.countDocuments({ role: "doctor" }),
        Appointment.countDocuments({}),
        AIAnalysis.countDocuments({}),
        Appointment.countDocuments({ status: "pending" }),
      ]);

      stats = {
        totalUsers,
        totalPatients,
        totalDoctors,
        totalAppointments,
        totalAnalyses,
        pendingAppointments,
      };
    } else if (role === "doctor") {
      const [
        myAppointments,
        pendingAppointments,
        completedAppointments,
        myAnalyses,
        myPatients,
      ] = await Promise.all([
        Appointment.countDocuments({ doctor: userId }),
        Appointment.countDocuments({ doctor: userId, status: "pending" }),
        Appointment.countDocuments({ doctor: userId, status: "completed" }),
        AIAnalysis.countDocuments({ doctor: userId }),
        Appointment.distinct("patient", { doctor: userId }),
      ]);

      stats = {
        myAppointments,
        pendingAppointments,
        completedAppointments,
        myAnalyses,
        totalPatients: myPatients.length,
      };
    } else if (role === "patient") {
      const [myAppointments, upcomingAppointments, myReports, myAnalyses] =
        await Promise.all([
          Appointment.countDocuments({ patient: userId }),
          Appointment.countDocuments({
            patient: userId,
            status: { $in: ["pending", "confirmed"] },
            appointmentDate: { $gte: new Date() },
          }),
          Report.countDocuments({ patient: userId }),
          AIAnalysis.countDocuments({ patient: userId }),
        ]);

      stats = {
        myAppointments,
        upcomingAppointments,
        myReports,
        myAnalyses,
      };
    }

    cache.set(cacheKey, stats);

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    next(error);
  }
};

const getHealthTrends = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    const AIAnalysis = getAIAnalysisModel();
    let analyses = [];

    // For admin, get all analyses; for others, get their own
    if (role === "admin") {
      analyses = await AIAnalysis.find({});
    } else {
      analyses = await AIAnalysis.find({ patient: userId });
    }

    // Sort by creation date
    analyses.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    const trends = analyses.map((analysis) => ({
      date: analysis.createdAt,
      severity: analysis.aiResponse?.severity || "low",
      confidence: analysis.aiResponse?.confidence || 0,
      accuracy: analysis.accuracy || null,
      diagnosisCount: analysis.aiResponse?.possibleDiagnosis?.length || 0,
    }));

    res.json({
      success: true,
      trends,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  getDashboardStats,
  getHealthTrends,
  invalidateStatsCache, // export so auth controller can clear cache on new user creation
};
