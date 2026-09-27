#!/usr/bin/env python3
"""University project submission document for Streamix DDB system."""
from pathlib import Path
from docx import Document
from docx.shared import Inches, Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[1]
FIGS = ROOT / "docs" / "figures"
OUT = ROOT / "Streamix_University_Project_Submission.docx"

doc = Document()
for s in doc.sections:
    s.top_margin = Cm(2.2)
    s.bottom_margin = Cm(2.2)
    s.left_margin = Cm(2.5)
    s.right_margin = Cm(2.5)

normal = doc.styles["Normal"]
normal.font.name = "Times New Roman"
normal.font.size = Pt(12)
normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Times New Roman")
pf = normal.paragraph_format
pf.line_spacing_rule = WD_LINE_SPACING.ONE_POINT_FIVE
pf.space_after = Pt(8)


def set_run_font(run, size=12, bold=False, italic=False, color=None, name="Times New Roman"):
    run.font.name = name
    run._element.rPr.rFonts.set(qn("w:eastAsia"), name)
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    if color:
        run.font.color.rgb = RGBColor.from_string(color)


def heading(text, level=1):
    p = doc.add_heading(text, level=level)
    for r in p.runs:
        set_run_font(r, size=16 if level == 1 else 14 if level == 2 else 12, bold=True, color="1F4E79")
    return p


def para(text, bold=False, italic=False, center=False, size=12):
    p = doc.add_paragraph()
    if center:
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(text)
    set_run_font(r, size=size, bold=bold, italic=italic)
    p.paragraph_format.first_line_indent = Cm(0.75) if not center and not bold else Cm(0)
    return p


def bullet(text, level=0):
    p = doc.add_paragraph(text, style="List Bullet")
    for r in p.runs:
        set_run_font(r, size=12)
    if level:
        p.paragraph_format.left_indent = Cm(1.25 * level)
    return p


def code_block(text):
    for line in text.strip("\n").split("\n"):
        p = doc.add_paragraph()
        r = p.add_run(line)
        set_run_font(r, size=9, name="Courier New")
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.line_spacing = 1.0
        p.paragraph_format.first_line_indent = Cm(0)
        p.paragraph_format.left_indent = Cm(0.5)


def caption(text):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(text)
    set_run_font(r, size=10, italic=True)
    p.paragraph_format.first_line_indent = Cm(0)
    p.paragraph_format.space_after = Pt(14)
    return p


def add_fig(filename, caption_text, width=6.2):
    path = FIGS / filename
    if not path.exists():
        para(f"[Figure missing: {filename}]", italic=True, center=True)
        return
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.first_line_indent = Cm(0)
    run = p.add_run()
    run.add_picture(str(path), width=Inches(width))
    caption(caption_text)


def table(headers, rows):
    t = doc.add_table(rows=1 + len(rows), cols=len(headers))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, h in enumerate(headers):
        cell = t.rows[0].cells[i]
        cell.text = h
        for p in cell.paragraphs:
            for r in p.runs:
                set_run_font(r, size=10, bold=True)
    for ri, row in enumerate(rows):
        for ci, val in enumerate(row):
            cell = t.rows[ri + 1].cells[ci]
            cell.text = str(val)
            for p in cell.paragraphs:
                for r in p.runs:
                    set_run_font(r, size=9)
    doc.add_paragraph()


def page_break():
    doc.add_page_break()


# ===================== COVER =====================
for _ in range(1):
    doc.add_paragraph()
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("UNIVERSITY PROJECT SUBMISSION")
set_run_font(r, size=12, bold=True, color="666666")

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("STREAMIX")
set_run_font(r, size=32, bold=True, color="E50914")

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("A Distributed Movie Streaming Database System")
set_run_font(r, size=16, bold=True)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run(
    "Polyglot Microservices Architecture with PostgreSQL, MongoDB & Redis\n"
    "and a Netflix-style React Native Client"
)
set_run_font(r, size=12, italic=True)

doc.add_paragraph()
for line in [
    "Course: Distributed Databases (DDB)",
    "Project Type: Design & Implementation Report",
    "Submitted by: _______________________________",
    "Student ID: ________________________________",
    "Supervisor / Instructor: ____________________",
    "Institution: _______________________________",
    "Date: September 2026",
]:
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(line)
    set_run_font(r, size=12)

doc.add_paragraph()
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run(
    "This document presents the complete design, database schema, distributed database "
    "concepts, implementation, evaluation, and demonstration of the Streamix system."
)
set_run_font(r, size=10, italic=True)

page_break()

# ===================== DECLARATION =====================
heading("Declaration", 1)
para(
    "I hereby declare that this project report is my original work, prepared for the "
    "Distributed Databases course. The implementation described herein — including the "
    "polyglot microservices backend, distributed PostgreSQL/MongoDB/Redis cluster, and "
    "the Streamix mobile application — was developed as part of this academic project. "
    "Sources consulted for background concepts and the original project proposal/"
    "architecture documents are acknowledged in the References section. I understand that "
    "any form of plagiarism is subject to academic disciplinary action."
)
para("Signature: _______________________     Date: _______________", bold=False)
page_break()

# ===================== ABSTRACT =====================
heading("Abstract", 1)
para(
    "Streamix is a distributed movie-catalog platform that demonstrates core Distributed "
    "Database (DDB) concepts in a runnable system. The backend is organized as microservices "
    "behind an API gateway. Identity and the movie catalog are stored in PostgreSQL with "
    "vertical fragmentation of user data, horizontal sharding of movies across US and EU "
    "region shards, and primary–replica streaming replication. Watchlists and reviews are "
    "stored in MongoDB with application-level hash sharding. Redis provides response caching "
    "and a Streams-based event bus (Kafka stand-in). A recommendation service computes "
    "genre-affinity rankings, and an analytics service aggregates shard and cache metrics. "
    "A React Native client provides a Netflix-style interface including region-aware “Near You” "
    "routing via an X-Client-Region header. The report covers requirements, database design, "
    "architecture, implementation, testing, and viva demonstration procedures. Full CDN video "
    "delivery and production Kafka/Milvus/ClickHouse deployments are scoped as future work."
)
para("Keywords: Distributed Databases, Horizontal Fragmentation, Vertical Fragmentation, "
     "Replication, Shard Routing, Scatter-Gather, Polyglot Persistence, Microservices, "
     "PostgreSQL, MongoDB, Redis, React Native", italic=True)
page_break()

# ===================== TOC =====================
heading("Table of Contents", 1)
for item in [
    "1. Introduction",
    "2. Problem Statement & Objectives",
    "3. Literature / Background on DDB Concepts",
    "4. System Requirements",
    "5. Overall System Architecture",
    "6. Database Design",
    "   6.1 Conceptual ER Model",
    "   6.2 Vertical Fragmentation",
    "   6.3 Horizontal Fragmentation & Shard Keys",
    "   6.4 Physical Schema (Postgres / Mongo / Redis)",
    "   6.5 Replication Design",
    "   6.6 Integrity & Cross-Store References",
    "7. Distributed Query Processing",
    "8. Region-Aware Routing",
    "9. Caching & Asynchronous Events",
    "10. Recommendations & Analytics",
    "11. Microservices Implementation",
    "12. Mobile Application",
    "13. Deployment Topology",
    "14. Testing, Evaluation & Demo Results",
    "15. Alignment with Proposal Diagram",
    "16. Limitations & Future Work",
    "17. Conclusion",
    "References",
    "Appendix A — API Catalogue",
    "Appendix B — Container Inventory",
    "Appendix C — Setup Commands",
]:
    bullet(item)
page_break()

# ===================== 1 =====================
heading("1. Introduction", 1)
para(
    "Modern streaming platforms serve global audiences. A single centralized database "
    "becomes a bottleneck for latency, availability, and scale. Distributed Databases "
    "address this by fragmenting data across nodes, replicating for fault tolerance, and "
    "routing queries intelligently. This project implements Streamix — a teaching-oriented "
    "but fully runnable distributed movie streaming catalog — to apply these ideas in code."
)
para(
    "The project pairs a polyglot backend (PostgreSQL + MongoDB + Redis) with a Netflix-style "
    "mobile client. Students and examiners can start the cluster with Docker Compose, exercise "
    "shard routing and replication, and observe region-aware “Near You” behaviour from the app."
)
para(
    "The remainder of this report is organized as follows. Section 2 states objectives. "
    "Section 3 reviews DDB concepts. Sections 4–6 present requirements, architecture, and "
    "database design. Sections 7–10 detail distributed query, region routing, caching/events, "
    "and recommendations. Sections 11–14 cover implementation, mobile UI, deployment, and "
    "evaluation. Sections 15–17 discuss proposal alignment, limitations, and conclusions."
)

# ===================== 2 =====================
heading("2. Problem Statement & Objectives", 1)
heading("2.1 Problem Statement", 2)
para(
    "Design and implement a distributed backend for a movie streaming catalog that "
    "(i) fragments user, movie, watchlist, and review data appropriately, (ii) replicates "
    "critical stores for availability, (iii) routes reads/writes and region-sensitive "
    "queries correctly, and (iv) exposes the system through a usable mobile interface — "
    "all runnable locally with free open-source software."
)
heading("2.2 Objectives", 2)
bullet("Implement horizontal and vertical fragmentation with clear shard keys.")
bullet("Deploy real PostgreSQL streaming replication (primary–replica), not a mock.")
bullet("Provide a shard router with distribution transparency to the client.")
bullet("Demonstrate scatter-gather search and region-preferred nearby queries.")
bullet("Adopt polyglot persistence (Postgres + MongoDB + Redis) via microservices.")
bullet("Build a React Native Streamix client for end-to-end demonstration.")
heading("2.3 Scope Boundaries", 2)
bullet("In scope: catalog browse/search, watchlist, reviews, recommendations, admin sync from TMDb, trailers.")
bullet("Out of scope: full-feature CDN HLS streaming; production Kafka/Milvus/ClickHouse clusters.")

# ===================== 3 =====================
heading("3. Literature / Background on DDB Concepts", 1)
para(
    "A Distributed Database Management System (DDBMS) stores data across multiple sites "
    "while presenting a unified interface. Classic design dimensions include fragmentation, "
    "allocation, replication, and transparency [Ozsu & Valduriez]."
)
heading("3.1 Fragmentation", 2)
para(
    "Horizontal fragmentation partitions relations by rows (predicates or hash of a key). "
    "Vertical fragmentation partitions by columns, typically separating frequently accessed "
    "security attributes from bulky profile attributes. Hybrid fragmentation combines both."
)
heading("3.2 Replication", 2)
para(
    "Replication maintains copies for availability and read scale-out. Synchronous "
    "replication favours strong consistency; asynchronous streaming replication (as used "
    "by PostgreSQL WAL shipping) favours performance with bounded lag — a trade-off this "
    "project explicitly demonstrates."
)
heading("3.3 Transparency & Query Processing", 2)
para(
    "Location, fragmentation, and replication transparency hide physical details from "
    "applications. Distributed query processing may use targeted single-shard access or "
    "scatter-gather (fan-out + merge) when the shard key is unknown."
)
heading("3.4 Polyglot Persistence", 2)
para(
    "Polyglot persistence selects different storage engines per workload: relational for "
    "transactions, documents for flexible aggregates, and in-memory stores for cache/events. "
    "Streamix applies this pattern deliberately."
)

# ===================== 4 =====================
heading("4. System Requirements", 1)
heading("4.1 Functional Requirements", 2)
table(
    ["ID", "Requirement"],
    [
        ["FR1", "Users can register/login; JWT authorizes subsequent calls"],
        ["FR2", "Browse trending, search, and genre-filtered movies"],
        ["FR3", "Near You feed prefers client region shard"],
        ["FR4", "Add/remove watchlist items"],
        ["FR5", "Submit and list movie reviews"],
        ["FR6", "Personalized recommendations from watchlist/reviews"],
        ["FR7", "Admin can sync movies from TMDb into shards"],
        ["FR8", "Profile can override streaming region (US/EU)"],
    ],
)
heading("4.2 Non-Functional Requirements", 2)
table(
    ["ID", "Requirement"],
    [
        ["NFR1", "Local demo on Docker Desktop without paid cloud"],
        ["NFR2", "Fault isolation: one movie shard down must not fail entire search"],
        ["NFR3", "Distribution transparency for the mobile client"],
        ["NFR4", "Documented failover for Postgres movie primary"],
        ["NFR5", "Clear mapping from course DDB concepts to code artifacts"],
    ],
)

# ===================== 5 =====================
heading("5. Overall System Architecture", 1)
para(
    "Figure 0 shows the original architecture proposal presented to the instructor. "
    "Figure 1 shows the implemented polyglot microservice realization."
)
add_fig("fig0_proposal_architecture.png", "Figure 0. Original architecture proposal diagram (design target).", width=6.3)
add_fig("fig1_system_architecture.png", "Figure 1. Implemented Streamix polyglot DDB architecture.", width=6.3)
para(
    "Clients communicate exclusively with the API Gateway (port 4000). The gateway proxies "
    "paths to User, Catalog, Watchlist, Review, Recommendation, and Analytics services. "
    "Each service owns its store(s). Figure 11 summarizes transparency layers."
)
add_fig("fig11_transparency_layers.png", "Figure 2. Distribution transparency layers from app to physical nodes.", width=5.8)
add_fig("fig5_polyglot_persistence.png", "Figure 3. Polyglot persistence map (Postgres / MongoDB / Redis).", width=6.3)

# ===================== 6 =====================
heading("6. Database Design", 1)
heading("6.1 Conceptual ER Model", 2)
para(
    "The logical entities are User, Movie, WatchlistItem, and Review. A user has one "
    "profile, many watchlist entries, and many reviews. A movie has many reviews and may "
    "appear on many watchlists. Figure 4 captures entities, relationships, and fragmentation labels."
)
add_fig("fig2_er_fragmentation.png", "Figure 4. Logical ER model with fragmentation annotations.", width=6.3)

heading("6.2 Vertical Fragmentation", 2)
para(
    "The logical User relation is vertically fragmented into users_auth and users_profile "
    "in the user PostgreSQL database. Auth attributes are small and hot (checked on login); "
    "profile attributes are larger and colder. Both share user_id. Registration inserts both "
    "rows in a single transaction for consistency."
)
code_block("""
users_auth(user_id PK, email UNIQUE, password_hash, role, created_at, last_login_at)
users_profile(user_id PK/FK → users_auth, full_name, avatar_url, bio, preferences JSONB, updated_at)
""")

heading("6.3 Horizontal Fragmentation & Shard Keys", 2)
para(
    "Horizontal fragments are disjoint row subsets whose union reconstitutes the logical relation."
)
table(
    ["Logical relation", "Shard key", "Rule", "Physical nodes"],
    [
        ["movies", "content_id", "hash(content_id) mod 2", "movie-shard-us-*, movie-shard-eu-*"],
        ["watchlist", "user_id", "hash(user_id) mod 2", "watchlist-mongo-1/2"],
        ["reviews", "movie_id", "hash(movie_id) mod 2", "review-mongo-1/2"],
    ],
)
para(
    "Hashing uses MD5 of the key string, taking the first 4 bytes as an integer modulus N. "
    "This yields deterministic, even placement and stable routing for a given key."
)
code_block("""
shardIndex(key, N) = parseInt(md5(key)[0:8], 16) % N
""")
add_fig("fig3_sharding_replication.png", "Figure 5. Movie shard routing with primary–replica pairs and scatter-gather.", width=6.3)

heading("6.4 Physical Schema (Postgres / Mongo / Redis)", 2)
para(
    "Figure 6 consolidates physical collections/tables as deployed."
)
add_fig("fig10_physical_schema.png", "Figure 6. Physical schema map across Postgres, MongoDB, and Redis.", width=6.3)

para("Movies table (identical schema on every movie shard):", bold=True)
code_block("""
movies(
  content_id BIGINT PK,          -- also shard key (= tmdb_id)
  tmdb_id BIGINT, title, media_type,
  genres TEXT[], cast_members JSONB, director,
  release_year INT, language, overview,
  poster_path, backdrop_path, trailer_key,
  popularity NUMERIC, rating_avg NUMERIC, rating_count INT,
  home_region VARCHAR(10),       -- metadata US|EU
  created_at, updated_at
)
Indexes: GIN(to_tsvector(title)), GIN(genres), popularity DESC, ...
""")

para("MongoDB documents:", bold=True)
code_block("""
watchlist.items: { user_id, content_id, added_at }  unique(user_id, content_id)
reviews: { user_id, movie_id, rating, comment, moderation_status, created_at }
""")

para("Redis structures:", bold=True)
code_block("""
STRING cache keys with EX TTL ~60s
STREAM reviews:events
STRING counters stats:cache:hits|misses, stats:reviews:shard:{i}, ...
""")

heading("6.5 Replication Design", 2)
para(
    "The user database and each movie shard run Bitnami PostgreSQL with "
    "POSTGRESQL_REPLICATION_MODE=master|slave. Replicas subscribe via WAL streaming. "
    "The application writes only to primaries and prefers replicas for reads "
    "(read/write splitting). Watchlist and review Mongo nodes in this Phase-1 demo "
    "are single-node shards (replication can be added similarly)."
)
para(
    "Asynchronous replication may briefly return stale reads — an intentional "
    "consistency/latency trade-off documented for examiners."
)

heading("6.6 Integrity & Cross-Store References", 2)
para(
    "Cross-database references use shared identifiers only (user_id UUID, content_id/movie_id "
    "BIGINT). There are no foreign keys across Postgres and Mongo — typical for polyglot "
    "systems. Application logic maintains referential intent (e.g., watchlist content_id "
    "should exist in catalog). Review inserts asynchronously refresh movies.rating_avg on "
    "the movie’s Postgres shard."
)

# ===================== 7 =====================
heading("7. Distributed Query Processing", 1)
heading("7.1 Targeted Access", 2)
para(
    "When the shard key is known (GET /catalog/movie/:id, watchlist by user, reviews by movie), "
    "the router contacts exactly one node — O(1) shard selection."
)
heading("7.2 Scatter-Gather", 2)
para(
    "Search and trending fan the same SQL to every movie shard replica in parallel "
    "(Promise.allSettled), merge rows, sort, and paginate in the application layer. "
    "Failed shards are counted (shardsFailed) without failing the whole request — "
    "demonstrating partial failure isolation."
)
heading("7.3 Read/Write Paths", 2)
bullet("Write path: movieWriteConn / userWriteConn → primary only.")
bullet("Read path: movieReadConn / userReadConn → replica if available.")

# ===================== 8 =====================
heading("8. Region-Aware Routing", 1)
para(
    "Movie shards are labeled US and EU. The mobile client derives a region from the device "
    "timezone (Asia maps to EU as nearest of the two deployed shards) and may override it "
    "on the Profile screen. Every request sends X-Client-Region. GET /catalog/nearby queries "
    "the preferred shard first, falling back if empty or down."
)
add_fig("fig4_region_routing.png", "Figure 7. Region-aware routing and Near You flow.", width=6.3)
add_fig("fig8_profile_region.png", "Figure 8. Streamix Profile — streaming region override (X-Client-Region).", width=3.2)
para(
    "Viva nuance: home_region is metadata written at sync time; physical placement remains "
    "hash(content_id). Near You means “prefer the US/EU-labeled shard container,” not "
    "necessarily WHERE home_region = …."
)

# ===================== 9 =====================
heading("9. Caching & Asynchronous Events", 1)
para(
    "Catalog trending/search responses are cached in Redis (~60s TTL) with HIT/MISS logging. "
    "On review creation, the review service XADDs to Redis Stream reviews:events. The "
    "analytics service consumes via XREADGROUP. This is the local stand-in for Kafka."
)
add_fig("fig9_recs_events.png", "Figure 9. Review event pipeline and recommendation data sources.", width=6.3)

# ===================== 10 =====================
heading("10. Recommendations & Analytics", 1)
heading("10.1 Recommendation Algorithm", 2)
bullet("Load watchlist IDs from the user’s Mongo shard.")
bullet("Scatter user reviews across review Mongo shards.")
bullet("Fetch genres for those movies from Postgres movie shards.")
bullet("Score genres; take top 3; fetch matching movies; rank by affinity × popularity.")
bullet("Cold start → trending fallback.")
para("This is content-based filtering — not a vector database (Milvus remains Phase-2).")

heading("10.2 Analytics Summary", 2)
para(
    "GET /analytics/summary returns topology counts, Redis cache/stream stats, Mongo "
    "review counts per shard, and a polyglot map. It substitutes for ClickHouse in the local demo."
)

# ===================== 11 =====================
heading("11. Microservices Implementation", 1)
table(
    ["Service", "Port", "Store", "Responsibilities"],
    [
        ["api-gateway", "4000", "—", "Path proxy, health aggregation, header forward"],
        ["user-service", "4001", "Postgres user P/R", "Register/login, JWT, vertical fragments"],
        ["catalog-service", "4002", "Postgres movies + Redis", "Search, trending, nearby, admin TMDb, cache"],
        ["watchlist-service", "4003", "Mongo ×2", "CRUD watchlist by user shard"],
        ["review-service", "4004", "Mongo ×2 + Redis", "Reviews + Streams publish + rating update"],
        ["recommendation-service", "4005", "Mongo + Postgres", "Genre affinity recommendations"],
        ["analytics-service", "4006", "Redis + Mongo", "Summary metrics + stream consumer"],
    ],
)
para(
    "Shared libraries live under backend/shared/ (shardHash, auth, redis, pg pools, "
    "movieShardRouter, mongoShards). The mobile API base URL remains http://localhost:4000."
)

# ===================== 12 =====================
heading("12. Mobile Application", 1)
para(
    "StreamixApp is a React Native client with Netflix-inspired theming (#E50914). "
    "Screens: Login/Register, Home (hero + rows), Search, Watchlist, Movie Detail "
    "(in-app YouTube trailer + reviews), Profile, Admin (role-gated)."
)
add_fig("fig7_mobile_home.png", "Figure 10. Streamix mobile Home UI (illustrative mock aligned to implementation).", width=3.0)
add_fig("ui_screenshot_13.jpg", "Figure 11. Development environment — StreamixApp on iOS Simulator with Metro bundler.", width=6.0)
para(
    "Tab icons use Ionicons (home, search, bookmark, person). Region preference is stored "
    "in AsyncStorage and applied as X-Client-Region on each Axios request."
)

# ===================== 13 =====================
heading("13. Deployment Topology", 1)
para(
    "Docker Compose defines the full cluster on network ddbnet. Figure 12 shows container groups."
)
add_fig("fig6_deployment_topology.png", "Figure 12. Docker Compose deployment topology.", width=6.3)
para(
    "External port 4000 exposes the gateway. Database ports (5401–5422 Postgres, "
    "27017–27020 Mongo, 6379 Redis) remain published for inspection during demos."
)

# ===================== 14 =====================
heading("14. Testing, Evaluation & Demo Results", 1)
heading("14.1 Automated Tests", 2)
para(
    "Unit tests in backend/test/shardRouter.test.js verify hash determinism, shard index "
    "bounds, movie distribution across shards, and region-priority ordering (node --test)."
)
heading("14.2 Integration Checks Performed", 2)
bullet("GET /health → all six services status: ok; polyglot: true.")
bullet("Register/login via gateway → JWT issued.")
bullet("POST /watchlist → _store: mongodb and shard index returned.")
bullet("POST /reviews → Redis Streams event published; analytics counters increment.")
bullet("Repeated GET /catalog/trending → cache MISS then HIT in catalog logs.")
bullet("GET /analytics/summary → polyglot map and per-shard Mongo counts.")
heading("14.3 Failover Evaluation", 2)
para(
    "Per failover-demo.md: stopping a movie primary leaves the other shard’s results "
    "available via scatter-gather; promoting a replica restores write capacity. This "
    "validates limited blast radius and replication usefulness."
)

# ===================== 15 =====================
heading("15. Alignment with Proposal Diagram", 1)
table(
    ["Proposal element", "Implementation status"],
    [
        ["API Gateway + clients", "Implemented"],
        ["User service + Postgres replication", "Implemented"],
        ["Catalog sharding + replication", "Implemented (US/EU Postgres)"],
        ["Watchlist sharding by userId", "Implemented (MongoDB)"],
        ["Review sharding by movieId", "Implemented (MongoDB)"],
        ["Recommendation service", "Implemented (genre affinity)"],
        ["Analytics service", "Implemented (Redis+Mongo aggregates)"],
        ["Redis cache", "Implemented"],
        ["Event bus", "Redis Streams (Kafka stand-in)"],
        ["Kafka / Milvus / ClickHouse", "Designed — Phase-2"],
        ["Mongo mongos cluster", "App-level sharding in Phase-1"],
        ["CDN full-movie streaming", "Out of scope"],
    ],
)
para(
    "Examiner statement: The architecture PDF is the complete design vision. The submitted "
    "system implements the Distributed Database core and polyglot microservices on free "
    "local tooling, with explicit Phase-2 placeholders for warehouse/vector/message-bus scale-out."
)

# ===================== 16 =====================
heading("16. Limitations & Future Work", 1)
bullet("No automatic failover controller — promotion is manual (documented).")
bullet("Mongo shards lack replicas in Phase-1.")
bullet("Recommendations are content-based only.")
bullet("Trailer playback uses YouTube; no owned CDN.")
bullet("Future: Kafka, Milvus/Pinecone, ClickHouse, mongos, automated HA.")

# ===================== 17 =====================
heading("17. Conclusion", 1)
para(
    "Streamix successfully demonstrates Distributed Database principles in a complete, "
    "demoable stack: vertical and horizontal fragmentation, hash-based shard routing, "
    "primary–replica replication, scatter-gather queries, region-aware access, polyglot "
    "persistence, caching, asynchronous events, and microservices behind a transparent "
    "gateway — paired with a Netflix-style mobile client. The project meets the course "
    "goal of implementing, not only describing, distributed data management."
)
page_break()

# ===================== REFERENCES =====================
heading("References", 1)
refs = [
    "Ozsu, M. T., & Valduriez, P. Principles of Distributed Database Systems.",
    "PostgreSQL Global Development Group. Streaming Replication Documentation.",
    "MongoDB Inc. MongoDB Manual — Data Modeling & Sharding Concepts.",
    "Redis Ltd. Redis Streams documentation.",
    "Newman, S. Building Microservices.",
    "Fowler, M. Polyglot Persistence.",
    "The Movie Database (TMDb) API Documentation.",
    "React Native Documentation — https://reactnative.dev",
    "Project artifacts: Distributed Movie Streaming Database Proposal; System Architecture PDF; repository README & POLYglot-DEMO.md.",
]
for i, ref in enumerate(refs, 1):
    p = doc.add_paragraph()
    r = p.add_run(f"[{i}] {ref}")
    set_run_font(r, size=11)
    p.paragraph_format.first_line_indent = Cm(0)
    p.paragraph_format.left_indent = Cm(0.75)

page_break()

# ===================== APPENDICES =====================
heading("Appendix A — API Catalogue", 1)
table(
    ["Method", "Path", "Auth", "Notes"],
    [
        ["POST", "/auth/register", "No", "Vertical write auth+profile"],
        ["POST", "/auth/login", "No", "Read replica + JWT"],
        ["GET", "/catalog/trending", "No", "Scatter-gather + cache"],
        ["GET", "/catalog/search", "No", "Scatter-gather + cache"],
        ["GET", "/catalog/nearby", "No", "Region-preferred"],
        ["GET", "/catalog/movie/:id", "No", "Single shard"],
        ["POST", "/admin/movies/sync", "Admin", "TMDb → primary"],
        ["GET/POST/DEL", "/watchlist", "User", "Mongo by userId"],
        ["GET", "/reviews/movie/:id", "No", "Mongo by movieId"],
        ["POST", "/reviews", "User", "Mongo + Streams"],
        ["GET", "/recommendations", "User", "Genre affinity"],
        ["GET", "/analytics/summary", "No*", "Viva metrics"],
        ["GET", "/health", "No", "Gateway aggregation"],
    ],
)

heading("Appendix B — Container Inventory", 1)
table(
    ["Container", "Role"],
    [
        ["user-db-master / replica", "Identity Postgres P/R"],
        ["movie-shard-us-master / replica", "Movie shard 0"],
        ["movie-shard-eu-master / replica", "Movie shard 1"],
        ["watchlist-mongo-1 / 2", "Watchlist shards"],
        ["review-mongo-1 / 2", "Review shards"],
        ["ddb-redis", "Cache + Streams"],
        ["ddb-*-service", "Microservices"],
        ["ddb-api", "Gateway :4000"],
    ],
)

heading("Appendix C — Setup Commands", 1)
code_block("""
cd backend
cp .env.example .env   # set TMDB_API_KEY, JWT_SECRET
docker compose up -d --build
curl -s http://localhost:4000/health | jq
curl -s http://localhost:4000/analytics/summary | jq

# Promote admin (then re-login in app)
docker exec -e PGPASSWORD=app_pass user-db-master \\
  psql -U app -d user_db -c "UPDATE users_auth SET role='admin' WHERE email='you@example.com';"

# Mobile
cd StreamixApp && npm install && npx react-native run-ios
""")

para("")
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("— End of Submission Document —")
set_run_font(r, size=11, italic=True)

doc.save(OUT)
print("Wrote", OUT, "size", OUT.stat().st_size)
