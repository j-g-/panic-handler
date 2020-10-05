

function getQuestionColumnNames() {
  return [
    "qId",
    "agent",
    "requester",
    "accountId",
    "addressId",
    "question",
    "questionStatus",
    "assignedTo",
    "resolution",
    "submittedOn",
    "resolvedOn",
    "teamColor"
  ]

}

function getQuestionColumnIndexes() {
  let questionColumnsArr = getQuestionColumnNames();
  let questionColumnIndexes = questionColumnsArr.reduce( 
    (obj, columnName, index ) => {
      obj[columnName] =  index;
      return obj;
    } , new Object());
  return questionColumnIndexes;
}

function getStoredQuestionColumnIndexes(){
  const sp = PropertiesService.getScriptProperties();
  return JSON.parse(sp.getProperty("questionSheetIndexes"));
}

// Sets the titles for a sheets
function setQuestionSheetTitles_(sheet){
  const r = sheet.getRange("A1:L1");
  r.setValues([getQuestionColumnNames()]);
  sheet.deleteRows(2,999);
}

// Intitialize spreadsheet
function initializeSpreadSheet() {
  const sp = PropertiesService.getScriptProperties();
  let dataSpreadSheetId = sp.getProperty("data-spreadsheet-id");
  Logger.log(dataSpreadSheetId);
  const appFolderName = "Panic Handler";
  
  // Check for app folder
  if(!DriveApp.getFoldersByName(appFolderName).hasNext()){
      DriveApp.createFolder(appFolderName);
  }
  
  try {
    DriveApp.getFileById(dataSpreadSheetId)
  } catch (exception) {
    Logger.log(exception)
    dataSpreadSheetId = null;
  }

  //Check for data spreadsheet
  if (!dataSpreadSheetId) {
    // Create a Spreadsheet to hold the data
    const dataSpreadSheet =  SpreadsheetApp.create("Data", 1, 5);
    
    // Move it to app folder
    const folder = DriveApp.getFoldersByName(appFolderName).next();
    const spreadSheetFile = DriveApp.getFileById(dataSpreadSheet.getId());
    spreadSheetFile.moveTo(folder);
    
    // Set Sheet ID for this script
    sp.setProperty("data-spreadsheet-id", dataSpreadSheet.getId());
    
    // Intialize columns 
    
    // 1st for Agents Sheet
    let agentsSheet = dataSpreadSheet.getSheets()[0];
    agentsSheet.setName("Agents");
    agentsSheet.getRange("A1:E1").setValues([["email","id","name","rol", "group"]]);
    sp.setProperty("next-panic-id", 1);

    // 2nd for today's data and archive.
    const todaySheet = dataSpreadSheet.insertSheet("Today Questions");
    const archiveSheet = dataSpreadSheet.insertSheet("Questions Archive");
    [todaySheet, archiveSheet].forEach(setQuestionSheetTitles_);

    // store question sheeets colmum indexes
    sp.setProperty("questionSheetIndexes", 
      JSON.stringify(getQuestionColumnIndexes()));
  }
}
function getCurrentAgentRol(){
  const email = getCurrentUserEmail();
  const particpants = getStoredParticipants();
  const currentParticipant = particpants.find(p => p.email === email);
  let rol = "None"
  if(currentParticipant) {
    rol = currentParticipant.rol;

  } else {
    rol = 'None';

  }
  return rol;
}

// Gets participants stored in script properties
function getParticipants(){
  let participants = getStoredParticipants();
  let currenUserEmail = getCurrentUserEmail();
  return {currentUserEmail: currenUserEmail, participants: participants };
}

// Converts from spreadSheet row to user object
function agentRowToObject(agentRow){
  return {
    email: agentRow[0],
    id: agentRow[1],
    name: agentRow[2],
    rol: agentRow[3],
    group: agentRow[4]
  }
}

// Update participatns stored in script properties
function updateStoredParticipants(){
  const agentsSheet = getAgentsSheet_();
  let r = agentsSheet.getDataRange().getValues();
  r.shift();
  let participants = r.map(agentRow => agentRowToObject(agentRow));
  const sp = PropertiesService.getScriptProperties();
  sp.setProperty("stored-participants", JSON.stringify(participants));
}

// Gets participatns stored in script properties
function getStoredParticipants(){
  const sp = PropertiesService.getScriptProperties();
  let jsonData = sp.getProperty("stored-participants");
  return JSON.parse(jsonData);
}



// Handler for HTTP GET requests
function doGet(){  
  return HtmlService.createTemplateFromFile('index.html').evaluate().setTitle("Panic Handler");
}

// Gets the current user email 
function getCurrentUserEmail(){
  const currentUser = Session.getActiveUser();
  return currentUser.getEmail();
}


// Submits a question
function submitQuestion(questionInfoForm){
  Logger.log(questionInfoForm);
  const lock = LockService.getScriptLock();
  const reply = {"status":"Error", "data": null,  "message" : "Error" };
  const locked = lock.tryLock(2000);
  if (locked) {
    let date = new Date().toISOString();
    let sp = PropertiesService.getScriptProperties();
    let nextId = Number(sp.getProperty("next-panic-id"));
    let id = nextId;
    sp.setProperty("next-panic-id", (id + 1))
    lock.releaseLock();
    let dataSpreadsheet = SpreadsheetApp.openById(sp.getProperty("data-spreadsheet-id"));
    let todaySheet = dataSpreadsheet.getSheetByName("Today Questions");
    let questionRow = [
      id,           
      questionInfoForm.submitterId,                           
      questionInfoForm.requester,                           
      questionInfoForm.accountId, 
      questionInfoForm.addressId,                    
      questionInfoForm.requestInfo,                        
      "Pending",
      "Unassigned",
      "No Resolution Info",
      date,
      "",
      questionInfoForm.group
    ];
    todaySheet.appendRow(questionRow);
    reply["status"] = "Success";
    reply["data"] = questionRow;
    reply["message"] = "Added question to the queue";
  } else {
    reply["message"] = "Unable to insert question right now, Try agan later";
  }
  return reply;
}


function getTodaySheet_(){
  let sp = PropertiesService.getScriptProperties();
  const dataSpreadsheet = SpreadsheetApp.openById(sp.getProperty("data-spreadsheet-id"));
  return dataSpreadsheet.getSheetByName("Today Questions");
}


function getAgentsSheet_(){
  let sp = PropertiesService.getScriptProperties();
  const dataSpreadsheet = SpreadsheetApp.openById(sp.getProperty("data-spreadsheet-id"));
  return dataSpreadsheet.getSheetByName("Agents");
}

function getQuestionRange_(qId){
  const todaySheet = getTodaySheet_();
  let rowsEnd =  todaySheet.getLastRow();
  let idColumn = todaySheet.getRange(1, 1, rowsEnd).getValues();
  let rowIndex = idColumn.find( row =>  row[0] == qId);
  if(rowIndex) {
    let rowNumber = Number(rowIndex) + 1; 
    return  todaySheet.getRange(rowNumber, 1, 1, 12);;
  } else {
    return undefined;
  }
}

function resolveQuestion(questionInfo){
  Logger.log("Resolve question: "+questionInfo.qId);
  // find index on Today Questions sheet
  let rowRange = getQuestionRange_(questionInfo.qId);
  if(rowRange){
    let indexes = getStoredQuestionColumnIndexes();
    let values = rowRange.getValues();
    values[0][indexes.resolution] = questionInfo.resolution;
    values[0][indexes.questionStatus] = "Resolved";
    values[0][indexes.resolvedOn] = questionInfo.resolvedOn;
    rowRange.setValues(values);
  }
  Logger.log("Resolve end qid:"+questionInfo.qId);
}

function assignQuestion(assignToValues){
  Logger.log("Assign question: " + assignToValues.qId);
  // find index on Today Questions sheet
  let lock = LockService.getScriptLock();
  const locked = lock.tryLock(5000);
  if (locked) {
    let rowRange = getQuestionRange_(assignToValues.qId);
    let indexes = getStoredQuestionColumnIndexes();
    let values = rowRange.getValues();
    if (values[0][indexes.assignedTo] === 'Unassigned') {
      values[0][indexes.assignedTo] = assignToValues.assignee;
    }
    rowRange.setValues(values);
    lock.releaseLock();
  }
  Logger.log("Assign end qid:"+assignToValues.qId);
}

function getAllTodayQuestions() {
  const todaySheet = getTodaySheet_();
  let questions = todaySheet.getDataRange().getValues();
  questions.shift();
  return questions;
}

function getQuestionsByAgentId(agentId){
  const agentColumnIndex = 1;
  const results = getAllTodayQuestions().filter(row => row[agentColumnIndex].includes(agentId));
  return results;
}

