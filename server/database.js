const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '../../data/math.db'),
  logging: false,
});

const StudySession = sequelize.define('StudySession', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  title: { type: DataTypes.STRING, allowNull: false },
  subject: { type: DataTypes.STRING, defaultValue: 'Precalculus' },
  status: {
    type: DataTypes.ENUM('pending', 'processing', 'ready', 'failed'),
    defaultValue: 'pending',
  },
  rawText: { type: DataTypes.TEXT },
  topics: { type: DataTypes.TEXT },
}, { tableName: 'StudySessions', timestamps: true });

const Problem = sequelize.define('Problem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  sessionId: { type: DataTypes.INTEGER, allowNull: false },
  topicName: { type: DataTypes.STRING, allowNull: false },
  question: { type: DataTypes.TEXT, allowNull: false },
  hint: { type: DataTypes.TEXT },
  solution: { type: DataTypes.TEXT },
  difficulty: {
    type: DataTypes.ENUM('easy', 'medium', 'hard'),
    defaultValue: 'medium',
  },
}, { tableName: 'Problems', timestamps: false });

const QuizAttempt = sequelize.define('QuizAttempt', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  sessionId: { type: DataTypes.INTEGER, allowNull: false },
  problemId: { type: DataTypes.STRING, allowNull: false },
  correct: { type: DataTypes.BOOLEAN, allowNull: false },
}, { tableName: 'QuizAttempts', timestamps: true });

async function initDb() {
  await sequelize.authenticate();
  await sequelize.sync({ alter: true });
}

module.exports = { sequelize, StudySession, Problem, QuizAttempt, initDb };
