const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Account = require("../models/Account");
const Family = require("../models/Family");
// create json web token
const maxAge = 1000 * 365 * 24 * 60 * 60;
const createUserToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET_KEY, {
    expiresIn: maxAge,
  });
};

// POST /api/register
const register = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      repassword,
      phone,
      occupation,
      annualIncome,
      currency,
      country,
      dob,
    } = req.body;
    if (
      !name ||
      !email ||
      !password ||
      !phone ||
      !occupation ||
      !annualIncome ||
      !currency ||
      !country ||
      !dob
    ) {
      return res.render("register", { errMsg: "Invalid request!" });
    }
    if (password !== repassword) {
      return res.render("register", {
        errMsg: "Password & Confirm Password not match!",
      });
    }
    await User.init(); // Ensure indexes are built before creating a new user

    // Hash the password before saving
    const hashedPassword = await bcrypt.hash(password, 10); // 10 is the salt rounds value

    const new_user = new User({
      name,
      email,
      password: hashedPassword, // Store the hashed password
      phone,
      occupation,
      annualIncome: parseFloat(annualIncome),
      currency,
      country,
      dob: new Date(dob),
      expenseCategories: ["Fixed", "Variable"],
    });

    await new_user.save(); // Save the new user and wait for the result

    // If login is successful, generate a token
    const token = createUserToken(new_user._id);

    res.cookie("jwt", token, { httpOnly: true, maxAge: maxAge * 1000 });
    res.redirect("/");
  } catch (err) {
    console.log(err);
    res.render("register", { errMsg: err.message });
  }
};

// POST /api/login
const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.login(email, password);

    // If login is successful, generate a token
    const token = createUserToken(user._id);

    res.cookie("jwt", token, { httpOnly: true, maxAge: maxAge * 1000 });
    res.redirect("/");
  } catch (err) {
    console.log(err);
    res.render("login", { errMsg: err.message });
  }
};

const logout = (req, res) => {
  res.cookie("jwt", "", { maxAge: 1 });
  res.redirect("/login");
};

const addAccount = async (req, res) => {
  const userId = req.userId;
  try {
    const { bankName, accountNumber, accountType } = req.body;
    if (!bankName || !accountNumber || !accountType) {
      return res.redirect("/");
    }

    await Account.init(); // Ensure indexes are built before creating a new user

    // Hash the password before saving
    const currentBalance =
      Math.floor(Math.random() * (3000000 - 100000 + 1)) + 100000;
    const user_account = new Account({
      userId,
      accountNumber,
      bankName,
      currentBalance,
      accountType,
    });

    // Save the new account and wait for the result
    const savedAccount = await user_account.save();

    // Push the new account's id to the user's accounts array
    await User.findByIdAndUpdate(userId, {
      $push: { accounts: savedAccount._id },
    });
    res.redirect("/");
  } catch (err) {
    console.log(err);
    res.render("login", { errMsg: err.message });
  }
};

const renderDashboard = async (req, res) => {
  const userId = req.userId;
  try {
    const user = await User.findById(userId).populate("accounts").exec();
    let totalBalance = 0;
    let totalInvested = 0;
    for (let i = 0; i < user.accounts.length; i++) {
      totalBalance += user.accounts[i].currentBalance;
    }
    for (let i = 0; i < user.investments.length; i++) {
      totalInvested += user.investments[i].amount;
    }
    if (user) {
      return res.render("dashboard", { user, totalBalance, totalInvested });
    }
    return res.render("login", { errMsg: "Account not found!" });
  } catch (err) {
    console.log(err);
    res.render("login", { errMsg: err.message });
  }
};

const renderPortals = async (req, res) => {
  const userId = req.userId;
  try {
    const user = await User.findById(userId).populate("accounts").exec();

    if (user) {
      return res.render("portal", { user });
    }
    return res.render("login", { errMsg: "Account not found!" });
  } catch (err) {
    console.log(err);
    res.render("login", { errMsg: err.message });
  }
};

const renderLogin = async (req, res) => {
  res.render("login", { errMsg: null });
};
const renderRegister = async (req, res) => {
  res.render("register", { errMsg: null });
};

// const renderChat = async (req, res) => {
//   res.render("chat_updated", { User });
// };

const renderChat = async (req, res) => {
  const userId = req.userId;
  try {
    const user = await User.findById(userId);

    if (user) {
      return res.render("chat_updated", { user });
    }
    return res.render("login", { errMsg: "Account not found!" });
  } catch (err) {
    console.log(err);
    res.render("login", { errMsg: err.message });
  }
};

// ::::::::::::::::::::::;;;; Chat bot start;;;;;;;;::::::::::::
const { ChatGroq } = require("@langchain/groq");
const { Pinecone } = require("@pinecone-database/pinecone");
require("dotenv").config();

// Initialize Pinecone
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const indexName = "semtech-gpt";
const index = pc.index(indexName);

// Initialize ChatGroq
const llm = new ChatGroq({
  model: "llama-3.1-70b-versatile",
  temperature: 0,
  maxTokens: undefined,
  maxRetries: 2,
});

// Function to get embeddings from a prompt
async function getEmbeddings(prompt) {
  const model = "multilingual-e5-large"; // Your model here
  const embeddings = await pc.inference.embed(model, [prompt], {
    inputType: "query",
  });
  return embeddings[0].values; // Return the embedding vector
}

// Function to query the Pinecone index
async function queryPinecone(embedding) {
  const queryResponse = await index.namespace("main-citi-site").query({
    topK: 3,
    vector: embedding,
    includeValues: false,
    includeMetadata: true,
  });

  return queryResponse.matches; // Return the matched documents
}

// Function to invoke the ChatGroq API with LLM
async function invokeChatGroq(messages) {
  const aiMsg = await llm.invoke(messages);
  return aiMsg; // Return the response from LLM
}

// Chatbot class to manage conversation state
class FinancialChatbot {
  constructor() {
    this.messages = [];
    this.turnLimit = 5; // Limit to last 5 turns
  }

  // Add message to the conversation
  addMessage(role, content) {
    this.messages.push({ role, content });
    // Maintain only the last 'turnLimit' messages
    if (this.messages.length > this.turnLimit) {
      this.messages.shift(); // Remove the oldest message
    }
  }

  // Main function to handle user query
  async handleUserQuery(userData, userPrompt) {
    // Get embeddings for the user prompt
    const embedding = await getEmbeddings(userPrompt);

    // Query the Pinecone index for relevant documents
    const references = await queryPinecone(embedding);

    // Prepare messages for LLM including references
    const referenceContent = references.map((ref) => ref.metadata).join("\n"); // Combine reference metadata into a string
    const messages = [
      {
        role: "system",
        content:
          "You are a personal AI assitant to help the user to mitigate their cyber attacks.Guide users, Don't give any unnecessary information.",
      },
      {
        role: "system",
        content: JSON.stringify(userData),
      },
      { role: "system", content: this.messages.toString() },
      { role: "user", content: userPrompt },
      { role: "system", content: `References:\n${referenceContent}` },
    ];

    // Invoke ChatGroq API to get response from LLM
    const llmResponse = await invokeChatGroq(messages);
    const ans = llmResponse.content;

    // Add user and assistant messages to the conversation
    this.addMessage("user", userPrompt);
    this.addMessage("assistant", ans);

    // Construct the final response
    return {
      response: ans,
      references: references.map((ref) => ref.metadata), // Return references as well
    };
  }
}

const chatbot = new FinancialChatbot();

const getResponse = async (req, res) => {
  const userId = req.userId;
  const { userPrompt } = req.body;

  try {
    // Fetch user data and populate related fields
    // const userFinancialData = await User.findById(userId)
    //   .populate([
    //     { path: "accounts" },
    //     {
    //       path: "familyId",
    //       populate: { path: "members" }, // Populating members within familyId
    //     },
    //   ])
    //   .exec();

    // const userFinancialData = require("../module_specs.json");
    const userFinancialData = require("../dataset.json");

    console.log(userFinancialData);

    // Handle chatbot user query
    const response = await chatbot.handleUserQuery(
      userFinancialData,
      userPrompt
    );

    console.log("Bot Response:", response["response"]);

    // Send response back to client
    res.json({ botResponse: response["response"] });
  } catch (error) {
    console.log("Error handling user query:", error);

    // Send error response to client
    res.json({ err: error.message });
  }
};

// ::::::::::::::::::::::;;;; Chat bot End;;;;;;;;::::::::::::
module.exports = {
  renderDashboard,
  getResponse,
  renderLogin,
  renderRegister,
  register,
  login,
  addAccount,
  logout,
  renderChat,
  renderPortals,
};

// Liabilities
