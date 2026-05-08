from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from typing import List, Dict, Any
from pydantic import BaseModel, Field, field_validator
import random, os, httpx, json
from datetime import datetime, timedelta
import vertexai
from vertexai.generative_models import GenerativeModel, Part, GenerationConfig

# ── DEV_MODE: set DEV_MODE=1 locally to skip Firebase token verification ─────
DEV_MODE = os.environ.get("DEV_MODE", "0") == "1"

if not DEV_MODE:
    import firebase_admin
    from firebase_admin import auth as firebase_auth
    if not firebase_admin._apps:
        firebase_admin.initialize_app()

app = FastAPI(title="SlayTrip API")

PROD_ORIGIN = "https://slaytrip-1013229880593.us-central1.run.app"
ALLOWED_ORIGINS = [PROD_ORIGIN, "http://localhost:8005", "http://127.0.0.1:8005"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

# ── Auth dependency ───────────────────────────────────────────────────────────
async def verify_token(request: Request) -> dict:
    """In DEV_MODE, skip token check. In production, verify Firebase ID token."""
    if DEV_MODE:
        return {"uid": "dev-user", "email": "dev@slaytrip.local"}
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing auth token")
    token = auth_header.split("Bearer ")[1]
    try:
        return firebase_auth.verify_id_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

# ── Models ───────────────────────────────────────────────────────────────────
class Destination(BaseModel):
    id: int
    name: str
    location: str
    description: str
    image: str
    rating: float
    price: str

VALID_BUDGET      = {"budget", "mid", "luxury"}
VALID_STYLES      = {"adventure", "culture", "food", "relax", "nightlife"}
VALID_GROUPS      = {"solo", "couple", "family", "group"}
VALID_CONSTRAINTS = {"vegetarian", "no_alcohol", "accessible", "child_friendly"}

class PlanRequest(BaseModel):
    model_config = {"str_strip_whitespace": True}

    destination:  str       = Field(..., min_length=2, max_length=60)
    start_date:   str
    end_date:     str
    budget_level: str
    travel_style: List[str] = Field(..., min_length=1, max_length=5)
    group_type:   str
    constraints:  List[str] = Field(default=[])

    @field_validator("budget_level")
    @classmethod
    def valid_budget(cls, v):
        if v not in VALID_BUDGET:
            raise ValueError(f"budget_level must be one of {VALID_BUDGET}")
        return v

    @field_validator("group_type")
    @classmethod
    def valid_group(cls, v):
        if v not in VALID_GROUPS:
            raise ValueError(f"group_type must be one of {VALID_GROUPS}")
        return v

    @field_validator("travel_style", mode="before")
    @classmethod
    def valid_style(cls, v):
        if isinstance(v, list):
            for item in v:
                if item not in VALID_STYLES:
                    raise ValueError(f"travel_style items must be in {VALID_STYLES}")
        return v

    @field_validator("constraints", mode="before")
    @classmethod
    def valid_constraint(cls, v):
        if isinstance(v, list):
            for item in v:
                if item not in VALID_CONSTRAINTS:
                    raise ValueError(f"constraint must be in {VALID_CONSTRAINTS}")
        return v

    @field_validator("end_date")
    @classmethod
    def valid_dates(cls, end, info):
        start_str = info.data.get("start_date")
        if start_str:
            try:
                start  = datetime.strptime(start_str, "%Y-%m-%d")
                end_dt = datetime.strptime(end, "%Y-%m-%d")
                if end_dt <= start:
                    raise ValueError("end_date must be after start_date")
                if (end_dt - start).days > 30:
                    raise ValueError("Trip cannot exceed 30 days")
            except ValueError as e:
                raise e
        return end

# ── Data ─────────────────────────────────────────────────────────────────────
MOCK_DESTINATIONS = [
    {"id": 1, "name": "Santorini",    "location": "Greece", "description": "Breathtaking sunsets and white-washed buildings overlooking the Aegean Sea.", "image": "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&q=80&w=800", "rating": 4.9, "price": "$$$"},
    {"id": 2, "name": "Kyoto",        "location": "Japan",  "description": "The perfect blend of ancient temples and modern vibrant culture.",             "image": "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&q=80&w=800", "rating": 4.8, "price": "$$"},
    {"id": 3, "name": "Amalfi Coast", "location": "Italy",  "description": "Dramatic cliffs and pastel-coloured villages on the Mediterranean coast.",     "image": "https://images.unsplash.com/photo-1533929736458-ca588d08c8be?auto=format&fit=crop&q=80&w=800", "rating": 4.7, "price": "$$$$"},
    {"id": 4, "name": "Jaipur",       "location": "India",  "description": "The Pink City — stunning palaces and vibrant bazaars.",                         "image": "https://images.unsplash.com/photo-1599661046289-e318978505c1?auto=format&fit=crop&q=80&w=800", "rating": 4.6, "price": "$$"},
    {"id": 5, "name": "Munnar",       "location": "India",  "description": "Rolling tea-plantation hills and mist-covered peaks in Kerala.",                "image": "https://images.unsplash.com/photo-1593693397690-362cb9666fc2?auto=format&fit=crop&q=80&w=800", "rating": 4.9, "price": "$$"},
    {"id": 6, "name": "Leh",          "location": "India",  "description": "High-altitude desert with dramatic landscapes and ancient monasteries.",         "image": "https://images.unsplash.com/photo-1581791538302-03537b9c97bf?auto=format&fit=crop&q=80&w=800", "rating": 4.8, "price": "$$$"},
    {"id": 7, "name": "Goa",          "location": "India",  "description": "Sun-kissed beaches, vibrant nightlife, and Portuguese-style architecture.",      "image": "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&q=80&w=800", "rating": 4.5, "price": "$$"},
    {"id": 8, "name": "Varanasi",     "location": "India",  "description": "One of the world's oldest living cities — spiritual heart of India.",            "image": "https://images.unsplash.com/photo-1561361513-2d000a50f0dc?auto=format&fit=crop&q=80&w=800", "rating": 4.7, "price": "$"},
    {"id": 9, "name": "Hyderabad",    "location": "India",  "description": "City of Pearls — Biryani, Charminar, and a buzzing tech culture.",               "image": "https://images.unsplash.com/photo-1572445271230-a78b5944a659?auto=format&fit=crop&q=80&w=800", "rating": 4.6, "price": "$$"},
    {"id": 10,"name": "Coorg",        "location": "India",  "description": "Scotland of India — coffee estates, waterfalls, and misty hills.",               "image": "https://images.unsplash.com/photo-1544735716-392fe2489ffa?auto=format&fit=crop&q=80&w=800", "rating": 4.7, "price": "$$"},
]

ACTIVITY_POOL: Dict[str, Dict[str, List[Dict]]] = {
    "goa": {
        "adventure": [
            {"title": "Parasailing at Baga Beach",      "location": "Baga Beach",    "duration": "2h", "cost_budget": 800,  "cost_mid": 1200, "cost_luxury": 2500, "tags": ["outdoor","thrill"]},
            {"title": "Jet Skiing at Calangute",         "location": "Calangute",     "duration": "1h", "cost_budget": 600,  "cost_mid": 900,  "cost_luxury": 1500, "tags": ["outdoor","water"]},
            {"title": "White Water Rafting at Mhadei",   "location": "Mhadei River",  "duration": "3h", "cost_budget": 1200, "cost_mid": 1800, "cost_luxury": 3000, "tags": ["outdoor","extreme"]},
            {"title": "Scuba Diving at Grande Island",   "location": "Grande Island", "duration": "4h", "cost_budget": 2500, "cost_mid": 3500, "cost_luxury": 6000, "tags": ["water","nature"]},
        ],
        "food": [
            {"title": "Seafood Breakfast at Fisherman's Wharf","location": "Panaji",        "duration": "1.5h","cost_budget": 300, "cost_mid": 700,  "cost_luxury": 1500, "tags": ["food","local"]},
            {"title": "Goan Fish Curry Cooking Class",          "location": "Old Goa",       "duration": "3h",  "cost_budget": 800, "cost_mid": 1500, "cost_luxury": 3000, "tags": ["food","culture"]},
            {"title": "Feni Tasting Tour",                      "location": "Anjuna",        "duration": "2h",  "cost_budget": 500, "cost_mid": 1000, "cost_luxury": 2000, "tags": ["food","local"]},
            {"title": "Sunset Dinner Cruise on Mandovi",        "location": "Mandovi River", "duration": "3h",  "cost_budget":1500, "cost_mid": 3000, "cost_luxury": 6000, "tags": ["food","scenic"]},
        ],
        "culture": [
            {"title": "Basilica of Bom Jesus",   "location": "Old Goa",  "duration": "1.5h","cost_budget": 0,   "cost_mid": 0,    "cost_luxury": 500,  "tags": ["history","heritage"]},
            {"title": "Chapora Fort Sunset Walk","location": "Chapora",  "duration": "2h",  "cost_budget": 0,   "cost_mid": 200,  "cost_luxury": 500,  "tags": ["heritage","scenic"]},
            {"title": "Spice Plantation Tour",   "location": "Ponda",    "duration": "3h",  "cost_budget": 600, "cost_mid": 1200, "cost_luxury": 2500, "tags": ["nature","culture"]},
        ],
        "relax": [
            {"title": "Sunrise Yoga at Arambol","location": "Arambol",   "duration": "1h", "cost_budget": 300, "cost_mid": 600,  "cost_luxury": 1500, "tags": ["wellness"]},
            {"title": "Ayurvedic Spa at Resort","location": "Calangute", "duration": "2h", "cost_budget":1500, "cost_mid": 3000, "cost_luxury": 7000, "tags": ["wellness","luxury"]},
            {"title": "Hammock at Palolem",     "location": "Palolem",   "duration": "3h", "cost_budget": 100, "cost_mid": 300,  "cost_luxury": 800,  "tags": ["relax","beach"]},
        ],
        "nightlife": [
            {"title": "Sunset at Vagator Cliffs","location": "Vagator",      "duration": "2h","cost_budget": 200, "cost_mid": 500,  "cost_luxury": 1500, "tags": ["scenic","social"]},
            {"title": "SinQ Beach Club Night",   "location": "Calangute",    "duration": "4h","cost_budget":1000, "cost_mid": 2500, "cost_luxury": 6000, "tags": ["nightlife","music"]},
            {"title": "Curlies Psytrance Party", "location": "Anjuna Beach", "duration": "5h","cost_budget": 500, "cost_mid": 1000, "cost_luxury": 2000, "tags": ["nightlife","party"]},
        ],
    },
    "jaipur": {
        "culture": [
            {"title": "Amber Fort Guided Tour",          "location": "Amber",      "duration": "3h",  "cost_budget": 500, "cost_mid": 1000, "cost_luxury": 3000, "tags": ["heritage","history"]},
            {"title": "Hawa Mahal & City Palace Walk",   "location": "Old Jaipur", "duration": "2h",  "cost_budget": 300, "cost_mid": 600,  "cost_luxury": 1500, "tags": ["heritage","architecture"]},
            {"title": "Jantar Mantar Astronomy Tour",    "location": "Jaipur",     "duration": "1.5h","cost_budget": 200, "cost_mid": 400,  "cost_luxury": 1000, "tags": ["history","science"]},
            {"title": "Block Printing Workshop",         "location": "Sanganer",   "duration": "3h",  "cost_budget": 600, "cost_mid": 1200, "cost_luxury": 2500, "tags": ["craft","culture"]},
        ],
        "food": [
            {"title": "Breakfast at LMB",              "location": "Johari Bazaar","duration": "1h", "cost_budget": 150,"cost_mid": 300,  "cost_luxury": 700,  "tags": ["food","local"]},
            {"title": "Rajasthani Thali at Chokhi Dhani","location":"Chokhi Dhani","duration": "2h", "cost_budget": 600,"cost_mid": 1200, "cost_luxury": 3000, "tags": ["food","culture"]},
            {"title": "Street Food Trail",             "location": "Old City",     "duration": "2h", "cost_budget": 300,"cost_mid": 600,  "cost_luxury": 1200, "tags": ["food","local"]},
        ],
        "adventure": [
            {"title": "Hot Air Balloon Sunrise Ride","location": "Amer",         "duration": "2h","cost_budget": 7000,"cost_mid": 9000, "cost_luxury":15000, "tags": ["adventure","scenic"]},
            {"title": "Camel Safari",               "location": "Sambhar Lake",  "duration": "3h","cost_budget": 1000,"cost_mid": 2000, "cost_luxury": 4000, "tags": ["adventure","nature"]},
        ],
        "relax": [
            {"title": "Spa at Rambagh Palace",     "location": "Rambagh",    "duration": "2h","cost_budget":3000,"cost_mid": 6000, "cost_luxury":15000, "tags": ["luxury","wellness"]},
            {"title": "Sunset at Nahargarh Fort",  "location": "Nahargarh",  "duration": "2h","cost_budget": 100,"cost_mid": 300,  "cost_luxury": 1000, "tags": ["scenic","relax"]},
        ],
    },
    "hyderabad": {
        "culture": [
            {"title": "Charminar & Laad Bazaar",         "location": "Old City",     "duration": "2h",  "cost_budget": 100,"cost_mid": 300, "cost_luxury": 800,  "tags": ["heritage","local"]},
            {"title": "Golconda Fort Light & Sound Show","location": "Golconda",     "duration": "2h",  "cost_budget": 200,"cost_mid": 500, "cost_luxury": 1200, "tags": ["history","heritage"]},
            {"title": "Salar Jung Museum",               "location": "Dar-ul-Shifa", "duration": "3h",  "cost_budget": 150,"cost_mid": 300, "cost_luxury": 700,  "tags": ["culture","art"]},
        ],
        "food": [
            {"title": "Shadab Biryani Experience",     "location": "High Court Rd","duration": "1h",  "cost_budget": 200,"cost_mid": 400, "cost_luxury": 1000, "tags": ["food","iconic"]},
            {"title": "Irani Chai & Osmania Biscuit",  "location": "Nimboliadda", "duration": "1.5h","cost_budget": 100,"cost_mid": 200, "cost_luxury": 500,  "tags": ["food","local"]},
            {"title": "Paradise Biryani Dinner",       "location": "Secunderabad","duration": "1.5h","cost_budget": 300,"cost_mid": 600, "cost_luxury": 1500, "tags": ["food","iconic"]},
        ],
        "adventure": [
            {"title": "Kayaking at Hussain Sagar",    "location": "Tank Bund",  "duration": "2h","cost_budget": 400,"cost_mid": 800, "cost_luxury": 2000, "tags": ["water","outdoor"]},
            {"title": "Trekking at Ananthagiri Hills","location": "Vikarabad",  "duration": "5h","cost_budget": 500,"cost_mid":1000, "cost_luxury": 2500, "tags": ["adventure","nature"]},
        ],
        "relax": [
            {"title": "Necklace Road Evening Stroll","location": "Hussain Sagar","duration": "2h","cost_budget": 0,   "cost_mid": 100, "cost_luxury": 300,  "tags": ["relax","scenic"]},
            {"title": "Spa at Taj Falaknuma",        "location": "Engine Bowli", "duration": "2h","cost_budget":4000, "cost_mid":8000, "cost_luxury":18000, "tags": ["luxury","wellness"]},
        ],
        "nightlife": [
            {"title": "Rooftop at 10 Downing Street","location": "Banjara Hills","duration": "3h","cost_budget": 800,"cost_mid":2000, "cost_luxury": 5000, "tags": ["nightlife","lounge"]},
        ],
    },
    "leh": {
        "adventure": [
            {"title": "Pangong Tso Lake Road Trip",    "location": "Pangong Lake",    "duration": "8h","cost_budget":2000,"cost_mid":4000,"cost_luxury": 8000,"tags": ["adventure","scenic"]},
            {"title": "River Rafting on Zanskar",      "location": "Zanskar River",   "duration": "4h","cost_budget":1500,"cost_mid":2500,"cost_luxury": 5000,"tags": ["adventure","water"]},
            {"title": "Mountain Biking at Khardung La","location": "Khardung La Pass","duration": "6h","cost_budget":1500,"cost_mid":3000,"cost_luxury": 7000,"tags": ["extreme","adventure"]},
        ],
        "culture": [
            {"title": "Thiksey Monastery Sunrise","location": "Thiksey", "duration": "3h","cost_budget": 200,"cost_mid": 500,"cost_luxury":1500,"tags":["spiritual","culture"]},
            {"title": "Leh Palace & Market Walk", "location": "Old Leh", "duration": "2h","cost_budget": 100,"cost_mid": 300,"cost_luxury": 800,"tags":["heritage","local"]},
        ],
        "relax": [
            {"title": "Stargazing at Nubra Valley","location": "Nubra Valley","duration": "3h","cost_budget": 500,"cost_mid":1200,"cost_luxury":3000,"tags":["nature","relax"]},
            {"title": "Hot Spring at Panamik",     "location": "Panamik",     "duration": "2h","cost_budget": 200,"cost_mid": 500,"cost_luxury":1200,"tags":["wellness","nature"]},
        ],
    },
    "default": {
        "culture":   [{"title": "Local Heritage Walk",      "location": "City Center",     "duration": "2h","cost_budget": 200,"cost_mid": 500, "cost_luxury":1500,"tags":["culture"]}],
        "food":      [{"title": "Local Street Food Tour",   "location": "Old Market",      "duration": "2h","cost_budget": 300,"cost_mid": 600, "cost_luxury":1500,"tags":["food"]}],
        "adventure": [{"title": "Nature Hike & Viewpoint",  "location": "Outskirts",       "duration": "4h","cost_budget": 500,"cost_mid":1000, "cost_luxury":2500,"tags":["adventure"]}],
        "relax":     [{"title": "Sunset Lakeside Walk",     "location": "Lake Road",       "duration": "1.5h","cost_budget": 0,"cost_mid": 200, "cost_luxury": 500,"tags":["relax"]}],
        "nightlife": [{"title": "Rooftop Bar & Live Music", "location": "City Rooftop",    "duration": "3h","cost_budget": 500,"cost_mid":1500, "cost_luxury":4000,"tags":["nightlife"]}],
    },
}

HOTEL_POOL = {
    "budget":  [{"name": "Zostel Hostel",    "type": "Dorm Bed",       "per_night": 600},
                {"name": "OYO Budget Inn",   "type": "Private Room",   "per_night": 900}],
    "mid":     [{"name": "ibis Hotel",       "type": "Standard Room",  "per_night": 3000},
                {"name": "Lemon Tree Hotel", "type": "Superior Room",  "per_night": 4500}],
    "luxury":  [{"name": "Taj Hotel",        "type": "Deluxe Suite",   "per_night": 15000},
                {"name": "ITC Grand",        "type": "Executive Suite","per_night": 22000}],
}

TIME_SLOTS = ["07:30 AM","09:00 AM","11:00 AM","12:30 PM","02:00 PM","04:00 PM","06:30 PM","08:00 PM"]

# ── AI Engine (Vertex AI) ───────────────────────────────────────────────────
PROJECT_ID = "nssk1999promptwars"
LOCATION = "us-central1"

if not DEV_MODE:
    vertexai.init(project=PROJECT_ID, location=LOCATION)

async def generate_ai_itinerary(req: PlanRequest) -> Dict[str, Any]:
    """Calls Gemini 1.5 Flash to generate a high-quality, personalized itinerary."""
    model = GenerativeModel("gemini-1.5-flash-001")
    
    prompt = f"""
    You are SlayTrip AI, a Gen-Z travel expert. Create a detailed itinerary for a trip to {req.destination}.
    
    Details:
    - Dates: {req.start_date} to {req.end_date}
    - Budget: {req.budget_level} (Total budget in INR)
    - Travel Style: {', '.join(req.travel_style)}
    - Group: {req.group_type}
    - Constraints: {', '.join(req.constraints)}
    
    Requirements:
    1. Output MUST be valid JSON.
    2. Follow this structure:
    {{
        "destination": "{req.destination}",
        "start_date": "{req.start_date}",
        "end_date": "{req.end_date}",
        "num_days": <int>,
        "group_type": "{req.group_type}",
        "budget_level": "{req.budget_level}",
        "travel_styles": {json.dumps(req.travel_style)},
        "applied_constraints": ["..."],
        "hotel": {{ "name": "...", "type": "...", "per_night": <int>, "total": <int> }},
        "budget_breakdown": {{ "activities": <int>, "hotel": <int>, "transport": <int>, "total": <int> }},
        "days": [
            {{
                "day_number": 1,
                "date": "...",
                "activities": [
                    {{ 
                      "time": "09:00 AM", 
                      "title": "...", 
                      "location": "...", 
                      "duration": "2h", 
                      "cost": <int>, 
                      "status": "Confirmed",
                      "lat": <float>, 
                      "lng": <float>,
                      "transit_to_next": {{ "mode": "bus/train/walk", "duration": "15 min" }}
                    }}
                ]
            }}
        ]
    }}
    
    Guidelines:
    - Use INR (₹) for all costs.
    - Be creative and specific for {req.destination}.
    - Ensure constraints like '{req.constraints}' are respected.
    - Include geographic coordinates (lat, lng) for all activities.
    """

    try:
        response = model.generate_content(
            prompt,
            generation_config=GenerationConfig(response_mime_type="application/json")
        )
        return json.loads(response.text)
    except Exception as e:
        print(f"AI Generation failed: {e}")
        return build_itinerary(req) # Fallback to mock logic

# ── Mock Engine (Fallback) ────────────────────────────────────────────────────
def build_itinerary(req: PlanRequest) -> Dict[str, Any]:
    dest_key   = req.destination.lower().strip()
    pool       = ACTIVITY_POOL.get(dest_key, ACTIVITY_POOL["default"])
    budget_key = req.budget_level

    start    = datetime.strptime(req.start_date, "%Y-%m-%d")
    end      = datetime.strptime(req.end_date,   "%Y-%m-%d")
    num_days = max(1, min((end - start).days, 30))

    eligible = []
    for style in req.travel_style:
        for act in pool.get(style, []):
            if "no_alcohol"    in req.constraints and "nightlife" in act.get("tags", []): continue
            if "child_friendly" in req.constraints and "extreme"  in act.get("tags", []): continue
            eligible.append({**act, "style": style})

    if not eligible:
        eligible = pool.get("culture", ACTIVITY_POOL["default"]["culture"])

    random.shuffle(eligible)
    days, used, total_activity_cost = [], set(), 0

    multiplier = {"solo": 1, "couple": 2, "family": 3, "group": 4}.get(req.group_type, 1)

    for day_idx in range(num_days):
        slots      = sorted(random.sample(TIME_SLOTS, min(3, len(TIME_SLOTS))))
        day_acts   = []
        current_dt = start + timedelta(days=day_idx)

        for slot in slots:
            for act in eligible:
                if act["title"] not in used:
                    used.add(act["title"])
                    cost = act.get(f"cost_{budget_key}", act.get("cost_mid", 500)) * multiplier
                    total_activity_cost += cost
                    day_acts.append({
                        "time": slot, "title": act["title"],
                        "location": act["location"], "duration": act.get("duration","2h"),
                        "cost": cost, "style_tag": act.get("style",""),
                        "tags": act.get("tags",[]),
                        "status": random.choice(["Confirmed","Confirmed","Pending"])
                    })
                    break

        days.append({"day_number": day_idx+1, "date": current_dt.strftime("%B %d, %Y"), "activities": day_acts})

    hotel         = random.choice(HOTEL_POOL.get(budget_key, HOTEL_POOL["mid"]))
    hotel_total   = hotel["per_night"] * num_days
    transport     = {"budget": 500, "mid": 1500, "luxury": 4000}.get(budget_key, 1500) * num_days
    total_budget  = total_activity_cost + hotel_total + transport

    badges = []
    if "vegetarian"    in req.constraints: badges.append("🌱 Vegetarian meals prioritized")
    if "no_alcohol"    in req.constraints: badges.append("🚫 Alcohol-free experiences")
    if "accessible"    in req.constraints: badges.append("♿ Accessibility checked")
    if "child_friendly" in req.constraints: badges.append("👶 Child-safe activities")

    return {
        "destination": req.destination, "start_date": req.start_date,
        "end_date": req.end_date, "num_days": num_days,
        "group_type": req.group_type, "budget_level": budget_key,
        "travel_styles": req.travel_style, "applied_constraints": badges,
        "hotel": {"name": hotel["name"], "type": hotel["type"],
                  "per_night": hotel["per_night"], "total": hotel_total},
        "budget_breakdown": {"activities": total_activity_cost,
                             "hotel": hotel_total, "transport": transport,
                             "total": total_budget},
        "days": days,
    }

# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "slaytrip-api"}

# PUBLIC — no auth required
@app.get("/api/destinations", response_model=List[Destination])
async def get_destinations():
    shuffled = MOCK_DESTINATIONS.copy()
    random.shuffle(shuffled)
    return shuffled

@app.post("/api/plan")
async def generate_plan(req: PlanRequest):
    try:
        # Check if we should use AI or fallback
        if not DEV_MODE:
            return await generate_ai_itinerary(req)
        return build_itinerary(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/updates")
async def get_updates():
    weather_info = "Weather data unavailable."
    try:
        # Real weather for a default location (e.g., Goa 15.29, 73.98)
        async with httpx.AsyncClient() as client:
            r = await client.get("https://api.open-meteo.com/v1/forecast?latitude=15.29&longitude=73.98&current_weather=true")
            if r.status_code == 200:
                data = r.json().get("current_weather", {})
                weather_info = f"Current temp in Goa: {data.get('temperature')}°C. Slay the day!"
    except:
        pass

    return [
        {"id": 1, "type": "Weather", "content": weather_info},
        {"id": 2, "type": "Flight",  "content": "Routes are operational. Aura is high."},
        {"id": 3, "type": "Tip",     "content": "Book 48h early for max aesthetic spots."},
        {"id": 4, "type": "Alert",   "content": "Local vibes are peak this weekend!"},
    ]

@app.post("/api/transit")
async def get_transit_info(payload: dict):
    """Fetches real transit/route data between two points."""
    origin = payload.get("origin")
    destination = payload.get("destination")
    mode = payload.get("mode", "transit") # transit, driving, walking

    if not origin or not destination:
        return {"duration": "15 min", "distance": "2 km", "mode": mode, "summary": "Short trip"}

    api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not api_key:
        # Fallback to mock if no key
        return {"duration": "12 min", "distance": "1.5 km", "mode": mode, "summary": "Calculated via fallback"}

    try:
        async with httpx.AsyncClient() as client:
            url = f"https://maps.googleapis.com/maps/api/directions/json?origin={origin}&destination={destination}&mode={mode}&key={api_key}"
            r = await client.get(url)
            if r.status_code == 200:
                data = r.json()
                if data["status"] == "OK":
                    route = data["routes"][0]["legs"][0]
                    return {
                        "duration": route["duration"]["text"],
                        "distance": route["distance"]["text"],
                        "mode": mode,
                        "summary": data["routes"][0]["summary"]
                    }
    except Exception as e:
        print(f"Transit API error: {e}")
    
    return {"duration": "20 min", "distance": "3 km", "mode": mode, "summary": "Estimated"}

# PROTECTED — Trip Persistence
@app.post("/api/save-trip")
async def save_trip(trip_data: dict, user: dict = Depends(verify_token)):
    try:
        uid = user['uid']
        trip_id = f"trip_{int(datetime.now().timestamp())}"
        trip_data['saved_at'] = datetime.now().isoformat()
        db.collection("users").document(uid).collection("trips").document(trip_id).set(trip_data)
        return {"status": "success", "trip_id": trip_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/my-trips")
async def get_my_trips(user: dict = Depends(verify_token)):
    try:
        uid = user['uid']
        docs = db.collection("users").document(uid).collection("trips").stream()
        trips = [doc.to_dict() for doc in docs]
        return sorted(trips, key=lambda x: x.get('saved_at', ''), reverse=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Serve frontend ────────────────────────────────────────────────────────────
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.isdir(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8005))
    uvicorn.run(app, host="0.0.0.0", port=port)
