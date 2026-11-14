// Reference data. Jobs below are SAMPLE listings, not real openings.
const SKILL_BANK=["python","java","c++","javascript","typescript","react","node.js","html","css","sql","mysql","mongodb","git","dsa","machine learning","deep learning","nlp","pandas","numpy","tensorflow","pytorch","docker","aws","rest api","figma","communication","problem solving","excel","power bi","statistics"];
const ALIASES={"js":"javascript","reactjs":"react","react.js":"react","node":"node.js","nodejs":"node.js","ml":"machine learning","data structures":"dsa","algorithms":"dsa","restful":"rest api","apis":"rest api","ts":"typescript","cpp":"c++","powerbi":"power bi","dl":"deep learning","natural language processing":"nlp"};
const ROLES={
 "AI/ML Engineer":["python","machine learning","pandas","numpy","deep learning","sql","git","dsa"],
 "Full-Stack Developer":["javascript","react","node.js","html","css","sql","git","rest api"],
 "Software Engineer (DSA)":["dsa","c++","java","python","sql","git","problem solving"],
 "Data Analyst":["python","sql","pandas","communication","excel","statistics","power bi"]
};
const yt=q=>"https://www.youtube.com/results?search_query="+encodeURIComponent(q);
const co=q=>"https://www.coursera.org/search?query="+encodeURIComponent(q);
const COURSES=[];
SKILL_BANK.forEach(s=>{COURSES.push({skill:s,title:s.toUpperCase()===s||s.length<4?s.toUpperCase()+" full course":s[0].toUpperCase()+s.slice(1)+" full course",type:"free",provider:"YouTube",url:yt(s+" full course")},{skill:s,title:s[0].toUpperCase()+s.slice(1)+" specializations",type:"paid",provider:"Coursera",url:co(s)})});
const JOBS=[
 {id:1,title:"SDE Intern",company:"Amazon",type:"Internship",field:"Software Engineer (DSA)",loc:"Bengaluru",skills:["dsa","java","python"],minScore:75,eligibility:"B.E./B.Tech 2026-28, CGPA 7+, strong DSA"},
 {id:2,title:"ML Intern",company:"Google",type:"Internship",field:"AI/ML Engineer",loc:"Remote",skills:["python","machine learning","numpy"],minScore:80,eligibility:"CS/IT student, ML projects required"},
 {id:3,title:"Frontend Developer",company:"Razorpay",type:"Full-time",field:"Full-Stack Developer",loc:"Bengaluru",skills:["react","javascript","css"],minScore:70,eligibility:"0-2 yrs, portfolio of React apps"},
 {id:4,title:"Data Analyst Trainee",company:"Infosys",type:"Full-time",field:"Data Analyst",loc:"Pune",skills:["sql","python","communication"],minScore:60,eligibility:"Any engineering degree, 60%+"}
];
// Offline fallback question bank (used only when the Gemini backend is unreachable)
const QUESTION_BANK={
 default:["Tell me about yourself and your strongest project.","Describe a hard technical problem you solved and how.","Why do you want this role, and why this company?","Tell me about a time you worked in a team and handled a disagreement.","Where do you want to be in three years?"],
 "AI/ML Engineer":["Explain overfitting and three ways to reduce it.","How would you evaluate a classification model on imbalanced data?","Walk me through an ML project you built end to end.","What is the difference between bagging and boosting?","How would you deploy a model and monitor it?"],
 "Full-Stack Developer":["Explain how the browser renders a page after a request.","What is the difference between SQL and NoSQL, and when would you pick each?","How do you secure a REST API?","Explain state management in React.","Walk me through a full-stack project you built."],
 "Software Engineer (DSA)":["Compare an array and a linked list.","Explain the time complexity of quicksort.","How would you detect a cycle in a linked list?","When would you use a hash map over a tree?","Describe how you approach an unfamiliar problem."],
 "Data Analyst":["How would you handle missing values in a dataset?","Explain the difference between INNER and LEFT JOIN.","How would you present insights to a non-technical manager?","Describe a dashboard or analysis you built.","What is a p-value in simple terms?"]
};
