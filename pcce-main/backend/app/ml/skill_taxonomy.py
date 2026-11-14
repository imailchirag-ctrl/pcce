"""Curated skill taxonomy, role requirements, and learning resources.

This is deliberately a product taxonomy, not a pretrained classifier. Combining
it with MiniLM semantic similarity and spaCy entity extraction gives transparent
resume intelligence without pretending base BERT can classify skills on its own.
"""

from __future__ import annotations

from typing import Any

# canonical skill -> aliases, category, related skills
SKILL_TAXONOMY: dict[str, dict[str, Any]] = {
    # Languages
    "python": {"aliases": ["python", "python3"], "category": "Language", "related": ["pandas", "numpy", "fastapi"]},
    "javascript": {"aliases": ["javascript", "js", "ecmascript"], "category": "Language", "related": ["typescript", "react"]},
    "typescript": {"aliases": ["typescript", "ts"], "category": "Language", "related": ["javascript", "react"]},
    "java": {"aliases": ["java"], "category": "Language", "related": ["spring boot"]},
    "c++": {"aliases": ["c++", "cpp"], "category": "Language", "related": ["algorithms"]},
    "c#": {"aliases": ["c#", "csharp", ".net"], "category": "Language", "related": ["azure"]},
    "go": {"aliases": ["golang", "go language"], "category": "Language", "related": ["microservices"]},
    "rust": {"aliases": ["rust"], "category": "Language", "related": ["systems programming"]},
    "sql": {"aliases": ["sql", "structured query language"], "category": "Data", "related": ["postgresql", "mysql"]},
    "r": {"aliases": ["r programming", "r language"], "category": "Language", "related": ["statistics"]},
    "scala": {"aliases": ["scala"], "category": "Language", "related": ["spark"]},
    "php": {"aliases": ["php"], "category": "Language", "related": ["laravel"]},
    "ruby": {"aliases": ["ruby", "ruby on rails", "rails"], "category": "Language", "related": ["rest apis"]},
    "kotlin": {"aliases": ["kotlin"], "category": "Language", "related": ["android"]},
    "swift": {"aliases": ["swift"], "category": "Language", "related": ["ios development"]},
    "bash": {"aliases": ["bash", "shell scripting"], "category": "Language", "related": ["linux"]},

    # Frontend
    "react": {"aliases": ["react", "react.js", "reactjs"], "category": "Frontend", "related": ["javascript", "next.js"]},
    "next.js": {"aliases": ["next.js", "nextjs", "next js"], "category": "Frontend", "related": ["react", "typescript"]},
    "vue.js": {"aliases": ["vue", "vue.js", "vuejs"], "category": "Frontend", "related": ["javascript"]},
    "angular": {"aliases": ["angular", "angularjs"], "category": "Frontend", "related": ["typescript"]},
    "svelte": {"aliases": ["svelte", "sveltekit"], "category": "Frontend", "related": ["javascript"]},
    "html": {"aliases": ["html", "html5", "semantic html"], "category": "Frontend", "related": ["css", "accessibility"]},
    "css": {"aliases": ["css", "css3", "stylesheet"], "category": "Frontend", "related": ["tailwind css", "responsive design"]},
    "tailwind css": {"aliases": ["tailwind", "tailwind css", "tailwindcss"], "category": "Frontend", "related": ["css"]},
    "sass": {"aliases": ["sass", "scss"], "category": "Frontend", "related": ["css"]},
    "accessibility": {"aliases": ["accessibility", "a11y", "wcag", "screen reader", "aria"], "category": "Frontend", "related": ["html", "usability testing"]},
    "responsive design": {"aliases": ["responsive design", "mobile-first", "responsive web"], "category": "Frontend", "related": ["css"]},
    "design systems": {"aliases": ["design system", "design systems", "component library"], "category": "Frontend", "related": ["react", "figma"]},
    "redux": {"aliases": ["redux", "redux toolkit", "rtk"], "category": "Frontend", "related": ["react"]},
    "react query": {"aliases": ["react query", "tanstack query"], "category": "Frontend", "related": ["react", "rest apis"]},
    "webpack": {"aliases": ["webpack"], "category": "Frontend", "related": ["javascript"]},
    "vite": {"aliases": ["vite"], "category": "Frontend", "related": ["javascript"]},
    "storybook": {"aliases": ["storybook"], "category": "Frontend", "related": ["design systems"]},
    "animation": {"aliases": ["animation", "framer motion", "motion design", "transitions"], "category": "Frontend", "related": ["css", "ui design"]},
    "figma": {"aliases": ["figma"], "category": "Design", "related": ["ui design", "prototyping"]},

    # Backend and APIs
    "node.js": {"aliases": ["node.js", "nodejs", "node js", "node"], "category": "Backend", "related": ["express.js", "javascript"]},
    "express.js": {"aliases": ["express", "express.js", "expressjs"], "category": "Backend", "related": ["node.js", "rest apis"]},
    "fastapi": {"aliases": ["fastapi"], "category": "Backend", "related": ["python", "rest apis"]},
    "django": {"aliases": ["django"], "category": "Backend", "related": ["python", "postgresql"]},
    "flask": {"aliases": ["flask"], "category": "Backend", "related": ["python", "rest apis"]},
    "spring boot": {"aliases": ["spring boot", "spring"], "category": "Backend", "related": ["java", "microservices"]},
    "rest apis": {"aliases": ["rest api", "rest apis", "restful", "restful api", "api design"], "category": "Backend", "related": ["http", "graphql"]},
    "graphql": {"aliases": ["graphql", "apollo"], "category": "Backend", "related": ["rest apis"]},
    "microservices": {"aliases": ["microservices", "microservice architecture", "service-oriented"], "category": "Backend", "related": ["docker", "kubernetes"]},
    "websockets": {"aliases": ["websocket", "websockets", "socket.io"], "category": "Backend", "related": ["real-time systems"]},
    "authentication": {"aliases": ["authentication", "auth", "login system", "identity"], "category": "Backend", "related": ["oauth", "security"]},
    "oauth": {"aliases": ["oauth", "oauth2", "openid connect", "jwt"], "category": "Backend", "related": ["authentication"]},
    "grpc": {"aliases": ["grpc", "protocol buffers", "protobuf"], "category": "Backend", "related": ["microservices"]},

    # Data
    "postgresql": {"aliases": ["postgresql", "postgres", "psql"], "category": "Data", "related": ["sql", "database design"]},
    "mysql": {"aliases": ["mysql", "mariadb"], "category": "Data", "related": ["sql"]},
    "mongodb": {"aliases": ["mongodb", "mongo", "mongoose"], "category": "Data", "related": ["database design"]},
    "redis": {"aliases": ["redis", "caching", "cache"], "category": "Data", "related": ["database design"]},
    "sqlite": {"aliases": ["sqlite", "sqlite3"], "category": "Data", "related": ["sql"]},
    "elasticsearch": {"aliases": ["elasticsearch", "opensearch"], "category": "Data", "related": ["search"]},
    "vector databases": {"aliases": ["vector database", "vector databases", "pinecone", "weaviate", "qdrant", "pgvector", "faiss"], "category": "Data", "related": ["embeddings", "rag"]},
    "database design": {"aliases": ["database design", "schema design", "data modeling"], "category": "Data", "related": ["postgresql", "sql"]},
    "etl": {"aliases": ["etl", "elt", "data ingestion", "data pipelines"], "category": "Data", "related": ["python", "sql"]},
    "pandas": {"aliases": ["pandas"], "category": "Data", "related": ["python", "numpy"]},
    "numpy": {"aliases": ["numpy"], "category": "Data", "related": ["python", "statistics"]},
    "matplotlib": {"aliases": ["matplotlib", "seaborn"], "category": "Data", "related": ["data visualization"]},
    "data visualization": {"aliases": ["data visualization", "dashboard", "dashboards", "tableau", "power bi", "looker"], "category": "Data", "related": ["pandas", "statistics"]},
    "statistics": {"aliases": ["statistics", "statistical analysis", "hypothesis testing", "probability"], "category": "Data", "related": ["experimentation"]},
    "data analysis": {"aliases": ["data analysis", "analytics", "exploratory data analysis", "eda"], "category": "Data", "related": ["sql", "pandas"]},
    "experimentation": {"aliases": ["experimentation", "a/b testing", "ab testing", "experiment design"], "category": "Data", "related": ["statistics"]},

    # AI / ML
    "machine learning": {"aliases": ["machine learning", "ml", "supervised learning", "unsupervised learning"], "category": "AI/ML", "related": ["scikit-learn", "model evaluation"]},
    "deep learning": {"aliases": ["deep learning", "neural networks", "neural network"], "category": "AI/ML", "related": ["pytorch", "tensorflow"]},
    "pytorch": {"aliases": ["pytorch", "torch"], "category": "AI/ML", "related": ["deep learning"]},
    "tensorflow": {"aliases": ["tensorflow", "keras"], "category": "AI/ML", "related": ["deep learning"]},
    "scikit-learn": {"aliases": ["scikit-learn", "sklearn", "scikit learn"], "category": "AI/ML", "related": ["machine learning"]},
    "transformers": {"aliases": ["transformers", "hugging face", "huggingface", "bert", "distilbert"], "category": "AI/ML", "related": ["natural language processing"]},
    "natural language processing": {"aliases": ["natural language processing", "nlp", "text classification", "named entity recognition", "ner"], "category": "AI/ML", "related": ["spacy", "transformers"]},
    "computer vision": {"aliases": ["computer vision", "image classification", "object detection", "opencv"], "category": "AI/ML", "related": ["deep learning"]},
    "sentence transformers": {"aliases": ["sentence transformers", "sentence-transformers", "embeddings", "semantic search", "vector embeddings"], "category": "AI/ML", "related": ["vector databases", "rag"]},
    "llm": {"aliases": ["llm", "large language model", "language model", "generative ai", "genai"], "category": "AI/ML", "related": ["prompt engineering", "rag"]},
    "rag": {"aliases": ["rag", "retrieval augmented generation", "retrieval-augmented generation"], "category": "AI/ML", "related": ["vector databases", "llm"]},
    "prompt engineering": {"aliases": ["prompt engineering", "prompt design"], "category": "AI/ML", "related": ["llm"]},
    "model evaluation": {"aliases": ["model evaluation", "model metrics", "precision recall", "evaluation metrics"], "category": "AI/ML", "related": ["machine learning"]},
    "mlops": {"aliases": ["mlops", "model deployment", "model serving", "model monitoring"], "category": "AI/ML", "related": ["docker", "model evaluation"]},
    "xgboost": {"aliases": ["xgboost"], "category": "AI/ML", "related": ["machine learning"]},
    "lightgbm": {"aliases": ["lightgbm"], "category": "AI/ML", "related": ["machine learning"]},
    "keybert": {"aliases": ["keybert"], "category": "AI/ML", "related": ["natural language processing"]},
    "spacy": {"aliases": ["spacy"], "category": "AI/ML", "related": ["natural language processing"]},
    "recommender systems": {"aliases": ["recommender systems", "recommendation system", "recommendation engine"], "category": "AI/ML", "related": ["machine learning", "sentence transformers"]},
    "reinforcement learning": {"aliases": ["reinforcement learning", "rl"], "category": "AI/ML", "related": ["machine learning"]},

    # Cloud / DevOps
    "aws": {"aliases": ["aws", "amazon web services", "ec2", "s3", "lambda"], "category": "Cloud", "related": ["cloud architecture", "docker"]},
    "gcp": {"aliases": ["gcp", "google cloud", "google cloud platform", "bigquery"], "category": "Cloud", "related": ["cloud architecture"]},
    "azure": {"aliases": ["azure", "microsoft azure"], "category": "Cloud", "related": ["cloud architecture"]},
    "docker": {"aliases": ["docker", "containers", "containerization"], "category": "DevOps", "related": ["kubernetes"]},
    "kubernetes": {"aliases": ["kubernetes", "k8s", "helm"], "category": "DevOps", "related": ["docker"]},
    "terraform": {"aliases": ["terraform", "infrastructure as code", "iac"], "category": "DevOps", "related": ["aws"]},
    "ci/cd": {"aliases": ["ci/cd", "cicd", "continuous integration", "continuous delivery", "github actions", "jenkins"], "category": "DevOps", "related": ["git"]},
    "github actions": {"aliases": ["github actions"], "category": "DevOps", "related": ["ci/cd"]},
    "linux": {"aliases": ["linux", "unix", "ubuntu"], "category": "DevOps", "related": ["bash"]},
    "nginx": {"aliases": ["nginx", "reverse proxy"], "category": "DevOps", "related": ["linux"]},
    "observability": {"aliases": ["observability", "monitoring", "logging", "prometheus", "grafana", "sentry"], "category": "DevOps", "related": ["mlops"]},
    "serverless": {"aliases": ["serverless", "lambda functions", "cloud functions"], "category": "Cloud", "related": ["aws"]},
    "cloud architecture": {"aliases": ["cloud architecture", "cloud infrastructure", "distributed systems"], "category": "Cloud", "related": ["aws", "microservices"]},
    "networking": {"aliases": ["networking", "tcp/ip", "dns", "http"], "category": "DevOps", "related": ["linux"]},

    # Security
    "cybersecurity": {"aliases": ["cybersecurity", "cyber security", "information security", "infosec"], "category": "Security", "related": ["network security"]},
    "network security": {"aliases": ["network security", "firewall", "intrusion detection", "ids", "ips"], "category": "Security", "related": ["cybersecurity"]},
    "penetration testing": {"aliases": ["penetration testing", "pen testing", "ethical hacking", "vulnerability assessment"], "category": "Security", "related": ["cybersecurity"]},
    "siem": {"aliases": ["siem", "splunk", "security operations", "soc"], "category": "Security", "related": ["incident response"]},
    "incident response": {"aliases": ["incident response", "threat hunting", "forensics"], "category": "Security", "related": ["cybersecurity"]},
    "cryptography": {"aliases": ["cryptography", "encryption", "tls", "pki"], "category": "Security", "related": ["security"]},
    "owasp": {"aliases": ["owasp", "secure coding", "application security", "appsec"], "category": "Security", "related": ["cybersecurity"]},
    "threat modeling": {"aliases": ["threat modeling", "threat model", "risk assessment"], "category": "Security", "related": ["cybersecurity"]},

    # Product / Design
    "product management": {"aliases": ["product management", "product manager", "product strategy"], "category": "Product", "related": ["roadmapping"]},
    "user research": {"aliases": ["user research", "customer interviews", "user interviews"], "category": "Product", "related": ["usability testing"]},
    "wireframing": {"aliases": ["wireframing", "wireframes", "mockups"], "category": "Design", "related": ["prototyping"]},
    "prototyping": {"aliases": ["prototyping", "prototype", "interactive prototype"], "category": "Design", "related": ["figma"]},
    "ux design": {"aliases": ["ux design", "user experience", "ux"], "category": "Design", "related": ["user research"]},
    "ui design": {"aliases": ["ui design", "user interface design", "visual design"], "category": "Design", "related": ["figma"]},
    "usability testing": {"aliases": ["usability testing", "usability study", "user testing"], "category": "Design", "related": ["user research"]},
    "analytics": {"aliases": ["product analytics", "google analytics", "mixpanel", "amplitude"], "category": "Product", "related": ["data analysis"]},
    "a/b testing": {"aliases": ["a/b testing", "ab testing", "split testing"], "category": "Product", "related": ["experimentation"]},
    "roadmapping": {"aliases": ["roadmapping", "product roadmap", "roadmap planning"], "category": "Product", "related": ["product management"]},
    "stakeholder management": {"aliases": ["stakeholder management", "stakeholders", "cross-functional collaboration"], "category": "Product", "related": ["communication"]},

    # Soft skills
    "communication": {"aliases": ["communication", "presented", "presentation", "written communication", "stakeholder updates"], "category": "Soft skill", "related": ["presentation skills"]},
    "leadership": {"aliases": ["leadership", "led a team", "team lead", "mentored", "mentoring"], "category": "Soft skill", "related": ["mentoring"]},
    "teamwork": {"aliases": ["teamwork", "collaboration", "collaborated", "cross-functional", "pair programming"], "category": "Soft skill", "related": ["communication"]},
    "problem solving": {"aliases": ["problem solving", "debugging", "troubleshooting", "root cause analysis"], "category": "Soft skill", "related": ["critical thinking"]},
    "critical thinking": {"aliases": ["critical thinking", "analytical thinking", "reasoning"], "category": "Soft skill", "related": ["problem solving"]},
    "adaptability": {"aliases": ["adaptability", "adaptable", "fast learner", "learned quickly"], "category": "Soft skill", "related": ["problem solving"]},
    "time management": {"aliases": ["time management", "prioritization", "prioritized"], "category": "Soft skill", "related": ["project management"]},
    "mentoring": {"aliases": ["mentoring", "mentored", "coaching", "onboarding engineers"], "category": "Soft skill", "related": ["leadership"]},
    "presentation skills": {"aliases": ["presentation skills", "public speaking", "presented to"], "category": "Soft skill", "related": ["communication"]},
    "negotiation": {"aliases": ["negotiation", "negotiated"], "category": "Soft skill", "related": ["communication"]},
    "conflict resolution": {"aliases": ["conflict resolution", "conflict", "mediation"], "category": "Soft skill", "related": ["communication"]},
    "project management": {"aliases": ["project management", "project planning", "delivery management"], "category": "Soft skill", "related": ["agile"]},
    "agile": {"aliases": ["agile", "scrum", "kanban", "sprint planning"], "category": "Soft skill", "related": ["project management"]},
    "scrum": {"aliases": ["scrum", "scrum master"], "category": "Soft skill", "related": ["agile"]},
    "documentation": {"aliases": ["documentation", "technical writing", "docs"], "category": "Soft skill", "related": ["writing"]},
    "writing": {"aliases": ["writing", "copywriting", "content writing"], "category": "Soft skill", "related": ["documentation"]},
    "customer empathy": {"aliases": ["customer empathy", "customer-centric", "user empathy"], "category": "Soft skill", "related": ["user research"]},

    # Domains
    "fintech": {"aliases": ["fintech", "financial technology", "payments", "banking"], "category": "Domain", "related": ["security"]},
    "healthcare": {"aliases": ["healthcare", "health tech", "clinical", "patient"], "category": "Domain", "related": ["data analysis"]},
    "e-commerce": {"aliases": ["e-commerce", "ecommerce", "retail", "marketplace"], "category": "Domain", "related": ["analytics"]},
    "saas": {"aliases": ["saas", "software as a service", "b2b software"], "category": "Domain", "related": ["product management"]},
    "edtech": {"aliases": ["edtech", "education technology", "learning platform"], "category": "Domain", "related": ["product management"]},

    # Testing and tools
    "git": {"aliases": ["git", "version control", "github", "gitlab"], "category": "Tool", "related": ["github actions"]},
    "github": {"aliases": ["github", "gitlab", "bitbucket"], "category": "Tool", "related": ["git", "ci/cd"]},
    "jira": {"aliases": ["jira", "confluence", "linear"], "category": "Tool", "related": ["agile"]},
    "notion": {"aliases": ["notion"], "category": "Tool", "related": ["documentation"]},
    "postman": {"aliases": ["postman", "insomnia"], "category": "Tool", "related": ["rest apis"]},
    "selenium": {"aliases": ["selenium"], "category": "Tool", "related": ["testing"]},
    "playwright": {"aliases": ["playwright"], "category": "Tool", "related": ["testing"]},
    "jest": {"aliases": ["jest"], "category": "Tool", "related": ["testing"]},
    "pytest": {"aliases": ["pytest"], "category": "Tool", "related": ["testing"]},
    "cypress": {"aliases": ["cypress"], "category": "Tool", "related": ["testing"]},
    "testing": {"aliases": ["testing", "test automation", "unit testing", "integration testing", "qa"], "category": "Tool", "related": ["jest", "pytest"]},
    "api testing": {"aliases": ["api testing", "contract testing"], "category": "Tool", "related": ["postman", "testing"]},
}


ROLE_CATALOG: dict[str, dict[str, Any]] = {
    "software engineer": {
        "title": "Software Engineer",
        "summary": "Builds reliable software across the stack with strong fundamentals and collaboration.",
        "skills": ["python", "git", "sql", "rest apis", "problem solving", "teamwork", "testing"],
    },
    "frontend engineer": {
        "title": "Frontend Engineer",
        "summary": "Ships accessible, performant interfaces and reusable component systems.",
        "skills": ["javascript", "typescript", "react", "css", "html", "git", "rest apis", "accessibility", "testing"],
    },
    "frontend developer": {
        "title": "Frontend Developer",
        "summary": "Turns product designs into responsive, maintainable web experiences.",
        "skills": ["javascript", "typescript", "react", "css", "html", "git", "rest apis", "teamwork"],
    },
    "product engineer": {
        "title": "Product Engineer",
        "summary": "Moves fluidly between product thinking, frontend craft, and backend services.",
        "skills": ["javascript", "typescript", "react", "node.js", "sql", "rest apis", "communication", "problem solving"],
    },
    "ui developer": {
        "title": "UI Developer",
        "summary": "Builds expressive, accessible interfaces with careful CSS and motion craft.",
        "skills": ["javascript", "html", "css", "accessibility", "responsive design", "design systems", "figma", "git"],
    },
    "backend developer": {
        "title": "Backend Developer",
        "summary": "Designs APIs, data models, and services that stay fast and dependable.",
        "skills": ["python", "sql", "rest apis", "postgresql", "docker", "aws", "git", "testing"],
    },
    "full stack developer": {
        "title": "Full Stack Developer",
        "summary": "Owns features from interface to database and deployment.",
        "skills": ["javascript", "typescript", "react", "node.js", "sql", "postgresql", "rest apis", "docker", "git"],
    },
    "data scientist": {
        "title": "Data Scientist",
        "summary": "Turns data into models and decisions with statistical rigor.",
        "skills": ["python", "statistics", "pandas", "numpy", "machine learning", "sql", "data visualization", "communication"],
    },
    "machine learning engineer": {
        "title": "Machine Learning Engineer",
        "summary": "Takes models from experimentation into reliable production systems.",
        "skills": ["python", "machine learning", "deep learning", "pytorch", "numpy", "scikit-learn", "docker", "model evaluation", "sql"],
    },
    "ai engineer": {
        "title": "AI Engineer",
        "summary": "Builds applications on top of language, vision, and retrieval models.",
        "skills": ["python", "machine learning", "deep learning", "transformers", "llm", "rag", "sentence transformers", "fastapi", "docker"],
    },
    "data analyst": {
        "title": "Data Analyst",
        "summary": "Makes operational data legible and useful for business decisions.",
        "skills": ["sql", "python", "pandas", "statistics", "data visualization", "communication", "data analysis"],
    },
    "devops engineer": {
        "title": "DevOps Engineer",
        "summary": "Automates delivery, infrastructure, and observability.",
        "skills": ["linux", "docker", "kubernetes", "ci/cd", "aws", "terraform", "observability", "bash"],
    },
    "cybersecurity analyst": {
        "title": "Cybersecurity Analyst",
        "summary": "Detects, investigates, and reduces security risk across systems.",
        "skills": ["cybersecurity", "network security", "linux", "python", "siem", "incident response", "threat modeling"],
    },
    "product manager": {
        "title": "Product Manager",
        "summary": "Connects customer problems, business goals, and a focused delivery plan.",
        "skills": ["product management", "user research", "roadmapping", "analytics", "communication", "stakeholder management", "agile"],
    },
    "ux designer": {
        "title": "UX Designer",
        "summary": "Researches user needs and designs flows that feel clear and useful.",
        "skills": ["ux design", "user research", "wireframing", "prototyping", "usability testing", "figma", "communication"],
    },
}

ROLE_ALIASES = {
    "frontend developer": "frontend developer",
    "front end developer": "frontend developer",
    "front-end developer": "frontend developer",
    "frontend engineer": "frontend engineer",
    "front end engineer": "frontend engineer",
    "react developer": "frontend engineer",
    "ml engineer": "machine learning engineer",
    "machine learning engineer": "machine learning engineer",
    "ai engineer": "ai engineer",
    "data analyst": "data analyst",
    "business analyst": "data analyst",
    "backend developer": "backend developer",
    "back end developer": "backend developer",
    "full stack developer": "full stack developer",
    "fullstack developer": "full stack developer",
    "software engineer": "software engineer",
    "sde": "software engineer",
    "devops engineer": "devops engineer",
    "cybersecurity analyst": "cybersecurity analyst",
    "security analyst": "cybersecurity analyst",
    "product manager": "product manager",
    "ui developer": "ui developer",
    "product engineer": "product engineer",
    "ux designer": "ux designer",
}


def canonical_role(role: str | None) -> str:
    key = (role or "").strip().lower()
    if key in ROLE_CATALOG:
        return key
    return ROLE_ALIASES.get(key, "software engineer")


def role_profile(role: str | None) -> dict[str, Any]:
    key = canonical_role(role)
    profile = ROLE_CATALOG[key]
    return {"key": key, **profile}


def all_skill_names() -> list[str]:
    return sorted(SKILL_TAXONOMY.keys())


def alias_map() -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for canonical, data in SKILL_TAXONOMY.items():
        for alias in data["aliases"]:
            pairs.append((alias, canonical))
    return sorted(pairs, key=lambda item: len(item[0]), reverse=True)


LEARNING_RESOURCES: dict[str, dict[str, str]] = {
    "python": {"provider": "Python Docs", "url": "https://docs.python.org/3/tutorial/", "title": "The Python Tutorial"},
    "javascript": {"provider": "MDN", "url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript", "title": "MDN JavaScript Guide"},
    "typescript": {"provider": "TypeScript Docs", "url": "https://www.typescriptlang.org/docs/handbook/intro.html", "title": "TypeScript Handbook"},
    "react": {"provider": "React Docs", "url": "https://react.dev/learn", "title": "Learn React"},
    "next.js": {"provider": "Next.js Learn", "url": "https://nextjs.org/learn", "title": "Next.js Foundations"},
    "css": {"provider": "web.dev", "url": "https://web.dev/learn/css", "title": "Learn CSS"},
    "html": {"provider": "MDN", "url": "https://developer.mozilla.org/en-US/docs/Learn/HTML", "title": "Structuring the Web"},
    "accessibility": {"provider": "web.dev", "url": "https://web.dev/learn/accessibility", "title": "Learn Accessibility"},
    "sql": {"provider": "SQLBolt", "url": "https://sqlbolt.com/", "title": "SQLBolt Interactive Lessons"},
    "postgresql": {"provider": "PostgreSQL Tutorial", "url": "https://www.postgresqltutorial.com/", "title": "PostgreSQL Tutorial"},
    "node.js": {"provider": "Node.js Learn", "url": "https://nodejs.org/en/learn", "title": "Node.js Learn"},
    "fastapi": {"provider": "FastAPI Docs", "url": "https://fastapi.tiangolo.com/tutorial/", "title": "FastAPI Tutorial"},
    "docker": {"provider": "Docker 101", "url": "https://docs.docker.com/get-started/", "title": "Docker Get Started"},
    "kubernetes": {"provider": "Kubernetes Docs", "url": "https://kubernetes.io/docs/tutorials/", "title": "Kubernetes Tutorials"},
    "aws": {"provider": "AWS Skill Builder", "url": "https://skillbuilder.aws/", "title": "AWS Cloud Practitioner Essentials"},
    "git": {"provider": "Pro Git", "url": "https://git-scm.com/book/en/v2", "title": "Pro Git Book"},
    "machine learning": {"provider": "Google ML Crash Course", "url": "https://developers.google.com/machine-learning/crash-course", "title": "Machine Learning Crash Course"},
    "deep learning": {"provider": "PyTorch Tutorials", "url": "https://pytorch.org/tutorials/", "title": "PyTorch Tutorials"},
    "pytorch": {"provider": "PyTorch", "url": "https://pytorch.org/tutorials/beginner/basics/intro.html", "title": "Learn the Basics"},
    "pandas": {"provider": "pandas", "url": "https://pandas.pydata.org/docs/getting_started/", "title": "Getting Started with pandas"},
    "numpy": {"provider": "NumPy", "url": "https://numpy.org/learn/", "title": "NumPy Learn"},
    "statistics": {"provider": "Khan Academy", "url": "https://www.khanacademy.org/math/statistics-probability", "title": "Statistics and Probability"},
    "natural language processing": {"provider": "Hugging Face", "url": "https://huggingface.co/learn/nlp-course", "title": "Hugging Face NLP Course"},
    "transformers": {"provider": "Hugging Face", "url": "https://huggingface.co/docs/transformers/index", "title": "Transformers Documentation"},
    "sentence transformers": {"provider": "SBERT", "url": "https://www.sbert.net/", "title": "Sentence Transformers Documentation"},
    "llm": {"provider": "Hugging Face", "url": "https://huggingface.co/learn/llm-course", "title": "LLM Course"},
    "rag": {"provider": "LlamaIndex", "url": "https://docs.llamaindex.ai/en/stable/", "title": "Building RAG Applications"},
    "vector databases": {"provider": "pgvector", "url": "https://github.com/pgvector/pgvector", "title": "pgvector Guide"},
    "testing": {"provider": "Playwright", "url": "https://playwright.dev/docs/intro", "title": "Playwright Test Introduction"},
    "cybersecurity": {"provider": "TryHackMe", "url": "https://tryhackme.com/path/outline/introtocyber", "title": "Introduction to Cyber Security"},
    "network security": {"provider": "Cisco Networking Academy", "url": "https://www.netacad.com/", "title": "Networking Basics"},
    "figma": {"provider": "Figma Learn", "url": "https://help.figma.com/hc/en-us/categories/360002051613-Getting-started", "title": "Figma Getting Started"},
    "product management": {"provider": "Product School", "url": "https://productschool.com/free-product-management-resources", "title": "Product Management Resources"},
    "communication": {"provider": "Coursera", "url": "https://www.coursera.org/learn/wharton-communication-skills", "title": "Improving Communication Skills"},
    "problem solving": {"provider": "freeCodeCamp", "url": "https://www.freecodecamp.org/learn/", "title": "Practice Problem Solving"},
    "system design": {"provider": "System Design Primer", "url": "https://github.com/donnemartin/system-design-primer", "title": "System Design Primer"},
}

# Skills whose common names differ from the canonical role requirement.
SKILL_DISPLAY_NAMES = {name: name.title() for name in SKILL_TAXONOMY}
SKILL_DISPLAY_NAMES.update(
    {
        "sql": "SQL",
        "css": "CSS",
        "html": "HTML",
        "aws": "AWS",
        "gcp": "GCP",
        "ci/cd": "CI/CD",
        "rest apis": "REST APIs",
        "node.js": "Node.js",
        "next.js": "Next.js",
        "vue.js": "Vue.js",
        "c++": "C++",
        "c#": "C#",
        "ai/ml": "AI/ML",
        "llm": "LLM Engineering",
        "rag": "RAG",
        "nlp": "NLP",
        "spacy": "spaCy",
        "pytorch": "PyTorch",
        "tensorflow": "TensorFlow",
        "scikit-learn": "scikit-learn",
        "xgboost": "XGBoost",
        "lightgbm": "LightGBM",
        "mlops": "MLOps",
        "a/b testing": "A/B Testing",
        "ux design": "UX Design",
        "ui design": "UI Design",
        "design systems": "Design Systems",
        "accessibility": "Accessibility",
        "responsive design": "Responsive Design",
        "sentence transformers": "Sentence Transformers",
        "vector databases": "Vector Databases",
        "recommender systems": "Recommender Systems",
        "model evaluation": "Model Evaluation",
        "natural language processing": "Natural Language Processing",
        "machine learning": "Machine Learning",
        "deep learning": "Deep Learning",
        "product management": "Product Management",
        "project management": "Project Management",
        "stakeholder management": "Stakeholder Management",
    }
)


def display_name(skill: str) -> str:
    return SKILL_DISPLAY_NAMES.get(skill, skill.replace("-", " ").title())
