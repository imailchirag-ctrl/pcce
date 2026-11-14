"""Interview question generation with Qwen2.5 and a rich topic-aware question bank."""

from __future__ import annotations

import random
import time
from typing import Any

from app.ml.skill_taxonomy import display_name

SYSTEM = (
    "You are SkillBridge AI, an expert interview coach. Generate role-relevant practice questions. "
    "Return valid JSON only: {\"questions\":[{\"prompt\":string,\"topic\":string,\"why\":string}]}. "
    "Do not include answers or discriminatory questions."
)


def _mode_key(mode: str) -> str:
    value = (mode or "technical").lower()
    if "hr" in value or "human resource" in value:
        return "hr"
    if "behav" in value or "star" in value:
        return "behavioural"
    if "resume" in value or "profile" in value:
        return "resume"
    if "system" in value or "design" in value or "arch" in value:
        return "system_design"
    return "technical"


def generate_questions(
    role: str,
    mode: str = "technical",
    difficulty: str = "intermediate",
    resume_context: str = "",
    skills: list[str] | None = None,
    *,
    count: int = 12,
    use_llm: bool = True,
) -> dict[str, Any]:
    started = time.perf_counter()
    key = _mode_key(mode)
    skills = skills or []
    clean_skills = [display_name(skill) if skill.islower() else skill for skill in skills[:8]]
    skill_text = ", ".join(clean_skills) if clean_skills else "the primary skills for this role"
    target_count = max(5, min(25, count))

    llm_meta: dict[str, Any] = {"used_llm": False, "provider": "topic_bank_fallback"}
    questions: list[dict[str, Any]] = []

    if use_llm:
        prompt = (
            f"Role: {role}. Interview type: {key}. Difficulty: {difficulty}. "
            f"Candidate skills: {skill_text}. Resume context: {resume_context[:1800] or 'not supplied'}. "
            f"Write exactly {target_count} distinct questions that a real interviewer could ask for a {role}. "
            "For technical mode include architectural, debugging, performance, security, and trade-off questions. "
            "For behavioural mode use STAR-friendly prompts. Keep each question concise (under 35 words)."
        )
        result = _generate(prompt, count=target_count)
        llm_meta = {
            "used_llm": bool(result.get("ok")),
            "provider": result.get("provider"),
            "model": result.get("model"),
            "elapsed_ms": result.get("elapsed_ms", 0),
            "error": result.get("error"),
        }
        data = result.get("data") or {}
        raw_questions = data.get("questions", []) if isinstance(data, dict) else []
        for item in raw_questions:
            if isinstance(item, str) and item.strip():
                questions.append({
                    "prompt": item.strip(),
                    "topic": key.replace("_", " ").title(),
                    "why": f"Evaluates proficiency in {role} concepts.",
                })
            elif isinstance(item, dict) and item.get("prompt"):
                questions.append({
                    "prompt": str(item["prompt"])[:500].strip(),
                    "topic": str(item.get("topic") or key).replace("_", " ").title()[:80],
                    "why": str(item.get("why") or f"Evaluates proficiency in {role} concepts.")[:300],
                })
            if len(questions) >= target_count:
                break

    # If LLM returned fewer questions than requested or failed, backfill from topic-specific bank
    if len(questions) < target_count:
        fallback = _fallback_questions(role, key, clean_skills, count=target_count)
        existing_prompts = {q["prompt"].lower() for q in questions}
        for fb in fallback:
            if fb["prompt"].lower() not in existing_prompts:
                questions.append(fb)
                existing_prompts.add(fb["prompt"].lower())
            if len(questions) >= target_count:
                break

        if not llm_meta.get("used_llm"):
            llm_meta["notice"] = (
                f"Generated {len(questions)} randomized topic-curated questions for {role}."
            )

    return {
        "role": role,
        "mode": key,
        "difficulty": difficulty,
        "count": len(questions),
        "questions": questions[:target_count],
        "provider": llm_meta.get("provider"),
        "llm": llm_meta,
        "inference_ms": round((time.perf_counter() - started) * 1000, 1),
        "notice": "Practice questions only. They are not a prediction of a real interview.",
    }


def _generate(prompt: str, count: int = 12) -> dict[str, Any]:
    from app.ml.model_registry import registry

    tokens = max(600, count * 90)
    return registry.generate_json(prompt, system=SYSTEM, timeout=55, num_predict=tokens)


# ─── Rich Topic & Role Question Banks (15 Questions Per Topic) ───────────────

_TOPIC_BANKS: dict[str, list[tuple[str, str, str]]] = {
    "frontend": [
        ("Explain how the browser rendering pipeline works from HTML parsing to paint and composite.", "Browser Internals", "Tests core understanding of browser layout and paint lifecycle."),
        ("What is the difference between client-side rendering (CSR), server-side rendering (SSR), and incremental static regeneration (ISR)?", "Rendering Architecture", "Evaluates architecture decision-making in modern web frameworks."),
        ("How does the JavaScript Event Loop handle microtasks vs macrotasks? Give a concrete code example.", "JavaScript Runtime", "Probes deep understanding of async execution and scheduling."),
        ("How do you identify and fix unneeded re-renders in a complex React or component tree?", "Performance Optimization", "Tests ability to write efficient UI code at scale."),
        ("Explain the trade-offs between global state managers like Redux or Zustand vs React Context and server cache like React Query.", "State Management", "Assesses state architecture knowledge for large-scale applications."),
        ("How would you optimize Core Web Vitals (LCP, FID/INP, and CLS) on a high-traffic e-commerce page?", "Web Performance", "Evaluates real-world performance tuning metrics."),
        ("What security precautions do you implement on the client side to prevent Cross-Site Scripting (XSS) and CSRF attacks?", "Security", "Tests awareness of frontend vulnerability vectors."),
        ("How do you ensure web accessibility (WCAG 2.1 AA) when building custom interactive components like accessible modals or dropdowns?", "Accessibility (a11y)", "Evaluates adherence to inclusive design standards."),
        ("What is your strategy for responsive design across diverse viewports and handling mobile touch events?", "Responsive CSS", "Tests UI layout precision and mobile adaptability."),
        ("How do you configure and optimize Webpack or Vite code-splitting and tree-shaking to reduce bundle size?", "Build & Bundling", "Assesses build tool expertise and bundle budgeting."),
        ("How does the virtual DOM reconciliation algorithm in React work, and what role do unique keys play?", "React Internals", "Tests framework fundamentals and diffing heuristics."),
        ("How would you design an offline-first web application using Service Workers and IndexedDB?", "PWA Architecture", "Probes advanced modern web capabilities and resilience."),
        ("Describe a scenario where you had to debug a stubborn memory leak or detached DOM node in Chrome DevTools.", "Debugging", "Evaluates hands-on troubleshooting and profiling skills."),
        ("How do you handle graceful network degradation, retry strategies, and optimistic UI updates?", "Network Resilience", "Tests user experience design under poor network conditions."),
        ("How do you architect an enterprise Design System component library for reusability and type safety?", "Component Architecture", "Evaluates modularity, scalability, and TypeScript rigor."),
    ],
    "backend": [
        ("What is the difference between relational databases and NoSQL document stores? When would you choose each?", "Databases", "Evaluates data modeling and persistence trade-offs."),
        ("How do database indexes (B-Tree vs Hash) improve query speed, and what are their write performance costs?", "Database Indexing", "Assesses query optimization and storage engine mechanics."),
        ("Explain ACID transactions and compare them with the BASE consistency model in distributed databases.", "Data Consistency", "Tests foundational distributed data principles."),
        ("How would you design a rate limiter to protect public API endpoints from brute-force and DDoS attacks?", "API Security & Reliability", "Evaluates defensive API architecture."),
        ("Compare REST, GraphQL, and gRPC. What factors determine which protocol you select for inter-service communication?", "API Protocols", "Tests knowledge of communication protocols and latency tradeoffs."),
        ("How does Redis handle in-memory persistence (RDB vs AOF), and how would you implement cache invalidation safely?", "Caching Systems", "Assesses caching best practices and data integrity."),
        ("What is the difference between synchronous blocking, asynchronous non-blocking, and multithreaded I/O?", "Concurrency", "Evaluates server runtime and concurrency model comprehension."),
        ("How do message brokers like Apache Kafka or RabbitMQ ensure at-least-once or exactly-once message delivery?", "Event Streaming", "Tests message queue architecture and idempotency."),
        ("Explain how JSON Web Tokens (JWT) work, their stateless advantages, and how you handle token revocation or refresh safely.", "Authentication", "Probes secure authentication protocol design."),
        ("A microservice in production is experiencing sudden latency spikes. Walk me through your step-by-step diagnostic workflow.", "Production Debugging", "Evaluates system observability and diagnostic acumen."),
        ("How do you prevent SQL injection, timing attacks, and SSRF vulnerabilities in backend services?", "Backend Security", "Tests secure coding standards and risk mitigation."),
        ("How do you manage database schema migrations in zero-downtime deployment environments?", "Deployments & DevOps", "Assesses enterprise operations and schema versioning."),
        ("What are circuit breakers in distributed systems and how do libraries like Resilience4j prevent cascading failures?", "Fault Tolerance", "Evaluates resilience patterns under dependency outages."),
        ("How do you structure logging, distributed tracing (OpenTelemetry), and metrics to monitor microservice health?", "Observability", "Tests production monitoring and SLA maintenance."),
        ("Explain the CAP theorem and describe a real-world scenario where you chose availability over strong consistency.", "Distributed Architecture", "Tests deep theoretical and practical distributed systems understanding."),
    ],
    "fullstack": [
        ("Walk through an end-to-end user request: from browser DNS lookup and TLS handshake to database commit and back.", "Full Stack Lifecycle", "Tests comprehensive understanding of the complete web stack."),
        ("How do you architect state synchronization between client-side state and backend databases in real-time applications?", "Real-Time Systems", "Assesses WebSockets, SSE, and polling trade-offs."),
        ("How do you manage authentication sessions across frontend SPAs and multiple microservice backends securely?", "Security Architecture", "Evaluates cookie vs bearer token security architectures."),
        ("How do you handle server-side rendering (SSR) data hydration without flashing stale content or blocking time-to-interactive?", "Hydration & SSR", "Tests modern full-stack frontend-backend synchronization."),
        ("What is your approach to automated testing: how do you balance unit tests, integration tests, and end-to-end Cypress/Playwright tests?", "Testing Strategy", "Evaluates quality assurance and CI confidence."),
        ("How would you design a scalable image and file upload system that supports resizable variants and CDN caching?", "System Architecture", "Tests cloud storage (S3/GCS) and CDN integration."),
        ("How do you prevent Cross-Site Scripting (XSS), CSRF, and SQL Injection across both client and server boundaries?", "Full Stack Security", "Evaluates defense-in-depth security mindset."),
        ("Explain how you design database schemas, write ORM models, and optimize N+1 query problems in production.", "Data Layer", "Assesses database ergonomics and query performance."),
        ("What CI/CD pipelines have you built to ensure automated linting, testing, Docker builds, and zero-downtime rollouts?", "DevOps & CI/CD", "Tests deployment automation and release reliability."),
        ("How would you implement a full-text search feature for millions of records without locking your primary database?", "Search Architecture", "Evaluates Elasticsearch, Meilisearch, or Postgres tsvector solutions."),
        ("How do you manage environment configuration secrets across development, staging, and production securely?", "Secret Management", "Assesses security hygiene and config management."),
        ("Describe a critical production bug you fixed that required investigating both frontend network logs and backend server traces.", "Cross-Stack Debugging", "Evaluates problem-solving across stack boundaries."),
        ("How do you implement feature flags and dark launches to safely roll out new features to a subset of users?", "Release Engineering", "Tests progressive rollout strategies."),
        ("How do you design RESTful or GraphQL APIs that remain backwards compatible when requirements change?", "API Evolution", "Evaluates contract stability and deprecation strategy."),
        ("What are the trade-offs between monolithic full-stack applications (Next.js/Django/Rails) vs decoupled frontend-backend architectures?", "Monolith vs Microservices", "Assesses architectural judgment for team and scale."),
    ],
    "aiml": [
        ("Explain the trade-offs between bias and variance. How do regularization techniques like L1 and L2 affect them?", "ML Fundamentals", "Tests statistical learning foundations."),
        ("How does the Self-Attention mechanism in Transformer models calculate attention weights between tokens?", "Deep Learning & Transformers", "Assesses modern neural network architectural knowledge."),
        ("What is the difference between Retrieval-Augmented Generation (RAG) and model fine-tuning? When would you choose each?", "GenAI & LLMs", "Evaluates contemporary generative AI deployment decisions."),
        ("How do you detect and handle covariate shift and concept drift in production machine learning models?", "MLOps & Monitoring", "Tests production model reliability and lifecycle management."),
        ("Explain precision, recall, F1-score, and ROC-AUC. Which metric would you optimize for an imbalanced fraud detection model?", "Evaluation Metrics", "Evaluates metric selection for business problems."),
        ("How does backpropagation compute gradients through neural layers using the chain rule?", "Neural Computation", "Assesses mathematical rigor in optimization."),
        ("What strategies do you use to mitigate hallucination and factual inconsistency in Large Language Model responses?", "LLM Safety & Alignment", "Tests prompt engineering, grounding, and verification methods."),
        ("How do techniques like LoRA and QLoRA enable parameter-efficient fine-tuning on consumer hardware?", "Efficient Fine-Tuning", "Evaluates practical LLM training economics."),
        ("How do you handle severely imbalanced datasets during training? Discuss sampling and loss re-weighting techniques.", "Data Engineering", "Tests data preprocessing and loss formulation."),
        ("Explain how vector embeddings work and how vector databases index embeddings using algorithms like HNSW.", "Vector Search", "Evaluates semantic search and retrieval systems."),
        ("How do you optimize deep learning model inference speed using quantization, pruning, and ONNX or TensorRT?", "Inference Optimization", "Assesses model compression and deployment efficiency."),
        ("What is gradient clipping and why is it essential when training Recurrent Neural Networks or deep Transformers?", "Optimization Techniques", "Tests training stability and numerical issues."),
        ("How do you validate an ML model to prevent data leakage between training and validation splits?", "Validation Strategy", "Probes scientific rigor in experimental design."),
        ("What are the core differences between contrastive learning and masked language modeling?", "Self-Supervised Learning", "Evaluates modern representation learning methodologies."),
        ("How would you design an end-to-end MLOps pipeline from data ingestion to automated model retraining and shadow testing?", "MLOps Architecture", "Tests production machine learning system design."),
    ],
    "datascience": [
        ("How do you structure exploratory data analysis (EDA) when receiving an unfamiliar 10-million-row dataset?", "Exploratory Analysis", "Evaluates initial investigative data rigor."),
        ("Explain the Central Limit Theorem and why it is fundamental to statistical hypothesis testing.", "Statistics & Probability", "Assesses theoretical statistical foundation."),
        ("How would you design and analyze an A/B test for a major product change? How do you determine sample size and statistical power?", "Experimentation", "Tests experiment design and significance calculation."),
        ("How do you detect and treat missing data (MCAR, MAR, MNAR) and extreme outliers without biasing your conclusions?", "Data Cleaning", "Evaluates statistical data imputation techniques."),
        ("What is Principal Component Analysis (PCA) and how does it reduce dimensionality while preserving variance?", "Dimensionality Reduction", "Assesses mathematical and linear algebra understanding."),
        ("Compare tree-based models like XGBoost and LightGBM with linear models. When does gradient boosting outperform?", "Modeling Algorithms", "Evaluates algorithm selection and ensemble methods."),
        ("How do you communicate complex statistical findings and uncertainty intervals to non-technical executive stakeholders?", "Data Storytelling", "Assesses stakeholder communication and visualization skills."),
        ("Explain how SHAP (Shapley Additive exPlanations) values provide local and global model interpretability.", "Model Interpretability", "Tests explainable AI knowledge for regulatory compliance."),
        ("How do you handle multicollinearity among independent variables in regression analysis?", "Feature Engineering", "Probes diagnostic regression methods and VIF calculation."),
        ("What SQL window functions (like ROW_NUMBER, RANK, and LAG/LEAD) have you used to solve intricate analytical queries?", "Advanced SQL", "Evaluates analytical querying competence."),
        ("How do you prevent overfitting when tuning hyperparameters with cross-validation on time-series data?", "Time-Series Validation", "Tests temporal validation splits without future lookahead."),
        ("What is the difference between Type I and Type II errors, and how do you calibrate significance thresholds based on risk?", "Statistical Hypothesis Testing", "Assesses risk analysis and decision theory."),
        ("How do you build a cohort retention analysis to identify user churn drivers in SaaS applications?", "Business Analytics", "Evaluates practical customer behavior analysis."),
        ("Explain Simpson's Paradox with an intuitive real-world data example.", "Statistical Paradoxes", "Tests statistical intuition and confounding variable awareness."),
        ("How do you productionize a data science workflow using tools like Airflow, dbt, or Prefect?", "Data Pipelines", "Assesses repeatable pipeline construction."),
    ],
    "devops": [
        ("Explain the core differences between containerization with Docker and virtualization with hypervisors.", "Containers", "Evaluates foundational container knowledge."),
        ("How does Kubernetes manage pod scheduling, service discovery, and zero-downtime rolling updates?", "Kubernetes", "Tests container orchestration expertise."),
        ("What is Infrastructure as Code (IaC) and what are the benefits of declarative tools like Terraform over imperative scripts?", "Infrastructure as Code", "Assesses reproducible cloud infrastructure practices."),
        ("How do you design a secure CI/CD pipeline with automated vulnerability scanning, secret detection, and staging gates?", "CI/CD Security", "Evaluates DevSecOps best practices."),
        ("Explain the difference between Blue-Green deployments and Canary releases. How do you implement automated rollback?", "Deployment Strategies", "Tests release risk management and traffic splitting."),
        ("How would you architect a high-availability VPC across multiple cloud availability zones with public and private subnets?", "Cloud Networking", "Evaluates cloud networking and network isolation."),
        ("What is GitOps and how do tools like ArgoCD or Flux keep cluster state synchronized with Git repositories?", "GitOps", "Assesses modern Kubernetes delivery pipelines."),
        ("How do you establish monitoring, alerting, and SLA thresholds using Prometheus and Grafana without alert fatigue?", "Observability", "Evaluates production observability standards."),
        ("A critical service pod is in CrashLoopBackOff in your production cluster. Walk through your debugging procedure.", "Kubernetes Troubleshooting", "Tests operational debugging under pressure."),
        ("How do you manage cloud infrastructure secrets securely using HashiCorp Vault, AWS Secrets Manager, or Sealed Secrets?", "Secret Management", "Assesses security hygiene and key rotation."),
        ("What is Chaos Engineering and how do experiments with tools like Chaos Mesh enhance system resilience?", "Resilience Testing", "Tests proactive failure testing mindset."),
        ("How do you optimize cloud compute and storage costs (FinOps) in Kubernetes clusters with autoscaling?", "Cloud Cost Optimization", "Evaluates resource utilization and auto-scaling policies."),
        ("Explain mutual TLS (mTLS) and how service meshes like Istio or Linkerd secure inter-service traffic.", "Service Mesh & Security", "Tests zero-trust network architectures."),
        ("How do you formulate and test a comprehensive Disaster Recovery (DR) plan with defined RTO and RPO targets?", "Disaster Recovery", "Assesses business continuity planning."),
        ("What are Linux cgroups and namespaces, and how do they enforce resource limits and process isolation in Docker?", "Linux Internals", "Tests deep systems engineering fundamentals."),
    ],
    "systemdesign": [
        ("How would you design a URL shortening service like TinyURL that handles 100 million new URLs per month?", "System Architecture", "Evaluates end-to-end high-scale service design."),
        ("Explain consistent hashing and how it enables distributed caching and database sharding without mass re-indexing.", "Distributed Hashing", "Tests distributed data distribution algorithms."),
        ("How do you scale a relational database horizontally using read replicas, sharding keys, and connection pooling?", "Database Scaling", "Assesses database scalability bottlenecks."),
        ("What are the trade-offs between Layer 4 and Layer 7 load balancers? When would you use round-robin vs least connections?", "Load Balancing", "Evaluates network traffic distribution strategies."),
        ("How would you design a real-time collaborative document editing system like Google Docs using OT or CRDTs?", "Real-Time Collaboration", "Tests concurrency and conflict resolution algorithms."),
        ("How do you design an asynchronous notification system supporting email, SMS, and push notifications with retry queues?", "Event Architecture", "Evaluates message queuing, deduplication, and dead-letter handling."),
        ("What caching strategies (Cache-Aside, Write-Through, Write-Back, Write-Around) would you use for a high-read news feed?", "Caching Strategies", "Assesses cache hierarchy and eviction policies."),
        ("How would you design a distributed unique ID generator like Twitter Snowflake with high throughput and monotonicity?", "Distributed Systems", "Tests coordination-free ID generation mechanisms."),
        ("Explain the CAP theorem and PACELC theorem with practical architecture choices you have made.", "Architectural Theorems", "Evaluates theoretical tradeoffs in distributed design."),
        ("How would you architect a distributed rate-limiter across multiple worldwide edge regions using Redis or Token Bucket?", "Rate Limiting at Scale", "Tests distributed state synchronization."),
        ("How do you design a search autocomplete system that returns instant suggestions within 20 milliseconds?", "Low-Latency Systems", "Evaluates Trie data structures and edge caching."),
        ("What is database replication lag, how does it cause read-your-writes anomalies, and how do you prevent it?", "Data Consistency", "Assesses eventual consistency mitigation."),
        ("How would you design an analytics ingestion pipeline capable of ingesting 50,000 events per second reliably?", "Data Ingestion", "Tests streaming data architectures (Kafka, Flink, ClickHouse)."),
        ("How do you handle distributed transactions across multiple microservices using the Saga pattern (Choreography vs Orchestration)?", "Distributed Transactions", "Tests compensating transaction design."),
        ("How would you design a CDN edge caching architecture for high-volume video and static media streaming?", "Content Delivery", "Evaluates edge compute, caching, and origin shield patterns."),
    ],
    "hr": [
        ("Walk me through your professional background and what specifically attracted you to this role.", "Self-Introduction", "Evaluates career narrative, passion, and role alignment."),
        ("Describe a high-pressure deadline or emergency you faced at work. How did you prioritize tasks to succeed?", "Pressure & Deadlines", "Tests composure and prioritization under pressure."),
        ("Tell me about a time you strongly disagreed with a colleague or manager's technical direction. How did you resolve it?", "Conflict Resolution", "Evaluates emotional intelligence and constructive debate."),
        ("Describe a project that failed or did not meet expectations. What was your personal takeaway from that experience?", "Resilience & Growth", "Tests self-awareness and learning from mistakes."),
        ("Give an example of a time you had to learn a completely new framework, language, or domain within days.", "Adaptability", "Evaluates learning velocity and intellectual agility."),
        ("How do you handle receiving critical or tough feedback on your code or project delivery?", "Receiving Feedback", "Tests openness to feedback and continuous self-improvement."),
        ("Describe a time you mentored a junior teammate or helped an onboarding colleague ramp up quickly.", "Mentorship & Teamwork", "Assesses collaborative spirit and empathy."),
        ("How do you balance rapid delivery of new features with technical debt and code quality in agile sprints?", "Engineering Values", "Evaluates pragmatic trade-offs between speed and quality."),
        ("Tell me about a situation where you had to communicate a complex technical limitation to a non-technical client or executive.", "Stakeholder Communication", "Tests clarity and cross-disciplinary translation."),
        ("What kind of work environment and engineering culture empowers you to do your highest quality work?", "Culture & Fit", "Assesses organizational compatibility."),
        ("Describe a time when you took initiative on an unassigned problem because it was the right thing for the product.", "Ownership & Initiative", "Evaluates proactive leadership and ownership mindset."),
        ("How do you stay updated with emerging technologies and industry best practices alongside full-time work?", "Continuous Learning", "Tests curiosity and professional dedication."),
        ("Tell me about a time you had to say 'no' to a feature request or scope creep. How did you manage expectations?", "Boundary Management", "Assesses project scoping and diplomacy."),
        ("What are your primary professional growth goals over the next two to three years?", "Long-Term Vision", "Evaluates career ambition and goal-setting."),
        ("Why should our engineering team hire you over other qualified candidates for this position?", "Unique Value Proposition", "Tests confidence, clarity, and articulation of core strengths."),
    ],
    "behavioural": [
        ("Describe a situation where project specifications changed drastically mid-sprint. How did you pivot?", "Adaptability", "Evaluates adaptability to shifting business priorities."),
        ("Tell me about a time you identified a critical flaw before a release. How did you rally the team to address it?", "Quality Ownership", "Tests proactive risk mitigation and influence."),
        ("Give an example of a time you had to deliver under ambiguous requirements without clear guidance.", "Ambiguity", "Assesses autonomous decision-making and initiative."),
        ("Describe a scenario where team morale was low due to an outage or delay. What role did you play in keeping momentum?", "Team Dynamics", "Evaluates peer leadership and empathy."),
        ("Tell me about a time you had to compromise on your ideal architectural solution to meet a business deadline.", "Pragmatism", "Tests balance between engineering perfection and business reality."),
        ("Give an example of a successful cross-team collaboration where teams had competing priorities.", "Collaboration", "Assesses cross-organizational negotiation and alignment."),
        ("Describe a time you made an incorrect assumption about user behavior. How did data correct your direction?", "Data-Driven Mindset", "Tests humility and willingness to be guided by metrics."),
        ("Tell me about a time you advocated for an under-represented perspective or accessibility improvement.", "Inclusivity", "Evaluates commitment to user advocacy and inclusive design."),
        ("Describe a situation where you resolved a bottleneck in your team's development or deployment process.", "Process Improvement", "Tests continuous improvement and systems thinking."),
        ("Give an example of when you had to manage conflicting feedback from multiple senior stakeholders.", "Stakeholder Management", "Evaluates diplomatic consensus building."),
        ("Tell me about a time you stepped outside your primary role to unblock a project or help a struggling peer.", "Team Player", "Assesses selflessness and team-first attitude."),
        ("Describe an ethical dilemma or security tradeoff you faced in a software project and how you addressed it.", "Integrity & Ethics", "Evaluates principled decision making."),
        ("Give an example of a time you turned a dissatisfied customer or client into a vocal advocate.", "Customer Obsession", "Tests customer empathy and problem resolution."),
        ("Tell me about a project where you measured clear, quantifiable impact on business revenue or latency.", "Impact & Results", "Assesses focus on tangible, measurable business outcomes."),
        ("Describe a moment you received public praise or recognition and how you shared credit with your team.", "Humility & Recognition", "Evaluates team recognition and humility."),
    ],
}


def _match_topic_bank(role: str, mode: str) -> list[tuple[str, str, str]]:
    lowered_role = role.lower()
    lowered_mode = mode.lower()

    if "hr" in lowered_mode or "human" in lowered_mode:
        return _TOPIC_BANKS["hr"]
    if "behav" in lowered_mode or "star" in lowered_mode:
        return _TOPIC_BANKS["behavioural"]
    if "system" in lowered_mode or "system design" in lowered_role or "architect" in lowered_role:
        return _TOPIC_BANKS["systemdesign"]

    # Role matching
    if any(k in lowered_role for k in ["frontend", "front-end", "react", "vue", "angular", "ui", "web dev"]):
        return _TOPIC_BANKS["frontend"]
    if any(k in lowered_role for k in ["backend", "back-end", "node", "python", "golang", "java", "api"]):
        return _TOPIC_BANKS["backend"]
    if any(k in lowered_role for k in ["fullstack", "full stack", "full-stack", "software engineer", "swe"]):
        return _TOPIC_BANKS["fullstack"]
    if any(k in lowered_role for k in ["ai", "machine learning", "ml", "deep learning", "nlp", "computer vision"]):
        return _TOPIC_BANKS["aiml"]
    if any(k in lowered_role for k in ["data science", "data scientist", "data analyst", "analytics"]):
        return _TOPIC_BANKS["datascience"]
    if any(k in lowered_role for k in ["devops", "cloud", "sre", "platform", "infrastructure", "kubernetes"]):
        return _TOPIC_BANKS["devops"]

    # Default to fullstack/technical
    return _TOPIC_BANKS["fullstack"]


def _fallback_questions(role: str, mode: str, skills: list[str], count: int = 12) -> list[dict[str, Any]]:
    bank = _match_topic_bank(role, mode)
    primary = skills[0] if skills else "your core technology stack"

    # Copy list so we can shuffle/sample without mutating
    pool = list(bank)
    random.shuffle(pool)

    # If count exceeds pool size, repeat with variation
    selected: list[tuple[str, str, str]] = []
    while len(selected) < count:
        for item in pool:
            selected.append(item)
            if len(selected) >= count:
                break

    results = []
    for prompt, topic, why in selected[:count]:
        # Personalize with role and primary skill if appropriate
        formatted_prompt = prompt.replace("your code", f"your code in {primary}") if "{primary}" in prompt else prompt
        results.append({
            "prompt": formatted_prompt,
            "topic": topic,
            "why": f"{why} ({role})",
        })
    return results
