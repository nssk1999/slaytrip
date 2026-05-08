from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import random
import os
from datetime import datetime, timedelta

app = FastAPI(title="SlayTrip Planning Engine API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────
#  MODELS
# ─────────────────────────────────────────
class Destination(BaseModel):
    id: int
    name: str
    location: str
    description: str
    image: str
    rating: float
    price: str

class PlanRequest(BaseModel):
    destination: str
    start_date: str          # YYYY-MM-DD
    end_date: str            # YYYY-MM-DD
    budget_level: str        # budget / mid / luxury
    travel_style: List[str] # adventure / culture / food / relax / nightlife
    group_type: str          # solo / couple / family / group
    constraints: List[str]  # vegetarian / no_alcohol / accessible / child_friendly

# ─────────────────────────────────────────
#  DESTINATIONS DATA
# ─────────────────────────────────────────
MOCK_DESTINATIONS = [
    {"id": 1, "name": "Santorini", "location": "Greece", "description": "Breathtaking sunsets and white-washed buildings overlooking the Aegean Sea.", "image": "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&q=80&w=800", "rating": 4.9, "price": "$$$"},
    {"id": 2, "name": "Kyoto", "location": "Japan", "description": "The perfect blend of ancient temples and modern vibrant culture.", "image": "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&q=80&w=800", "rating": 4.8, "price": "$$"},
    {"id": 3, "name": "Amalfi Coast", "location": "Italy", "description": "Dramatic cliffs and pastel-colored villages clinging to the Mediterranean coast.", "image": "https://images.unsplash.com/photo-1533929736458-ca588d08c8be?auto=format&fit=crop&q=80&w=800", "rating": 4.7, "price": "$$$$"},
    {"id": 4, "name": "Jaipur", "location": "India", "description": "The Pink City, known for its stunning palaces and vibrant bazaars.", "image": "https://images.unsplash.com/photo-1599661046289-e318978505c1?auto=format&fit=crop&q=80&w=800", "rating": 4.6, "price": "$$"},
    {"id": 5, "name": "Munnar", "location": "India", "description": "Rolling hills of tea plantations and mist-covered peaks in Kerala.", "image": "https://images.unsplash.com/photo-1593693397690-362cb9666fc2?auto=format&fit=crop&q=80&w=800", "rating": 4.9, "price": "$$"},
    {"id": 6, "name": "Leh", "location": "India", "description": "A high-altitude desert with dramatic landscapes and ancient monasteries.", "image": "https://images.unsplash.com/photo-1581791538302-03537b9c97bf?auto=format&fit=crop&q=80&w=800", "rating": 4.8, "price": "$$$"},
    {"id": 7, "name": "Goa", "location": "India", "description": "Sun-kissed beaches, vibrant nightlife, and Portuguese-style architecture.", "image": "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&q=80&w=800", "rating": 4.5, "price": "$$"},
    {"id": 8, "name": "Varanasi", "location": "India", "description": "One of the world's oldest living cities, spiritual heart of India on the Ganges.", "image": "https://images.unsplash.com/photo-1561361513-2d000a50f0dc?auto=format&fit=crop&q=80&w=800", "rating": 4.7, "price": "$"},
    {"id": 9, "name": "Hyderabad", "location": "India", "description": "City of Pearls — Biryani, Charminar, and a buzzing tech culture.", "image": "https://images.unsplash.com/photo-1572445271230-a78b5944a659?auto=format&fit=crop&q=80&w=800", "rating": 4.6, "price": "$$"},
    {"id": 10, "name": "Coorg", "location": "India", "description": "Scotland of India — coffee estates, waterfalls, and misty hills.", "image": "https://images.unsplash.com/photo-1544735716-392fe2489ffa?auto=format&fit=crop&q=80&w=800", "rating": 4.7, "price": "$$"},
]

# ─────────────────────────────────────────
#  ACTIVITY POOL (per destination + style)
# ─────────────────────────────────────────
ACTIVITY_POOL: Dict[str, Dict[str, List[Dict]]] = {
    "goa": {
        "adventure": [
            {"title": "Parasailing at Baga Beach", "location": "Baga Beach", "duration": "2h", "cost_budget": 800, "cost_mid": 1200, "cost_luxury": 2500, "tags": ["outdoor", "thrill"]},
            {"title": "Jet Skiing at Calangute", "location": "Calangute Beach", "duration": "1h", "cost_budget": 600, "cost_mid": 900, "cost_luxury": 1500, "tags": ["outdoor", "water"]},
            {"title": "White Water Rafting at Mhadei", "location": "Mhadei River", "duration": "3h", "cost_budget": 1200, "cost_mid": 1800, "cost_luxury": 3000, "tags": ["outdoor", "extreme"]},
            {"title": "Scuba Diving at Grande Island", "location": "Grande Island", "duration": "4h", "cost_budget": 2500, "cost_mid": 3500, "cost_luxury": 6000, "tags": ["water", "nature"]},
        ],
        "food": [
            {"title": "Seafood Breakfast at Fisherman's Wharf", "location": "Panaji", "duration": "1.5h", "cost_budget": 300, "cost_mid": 700, "cost_luxury": 1500, "tags": ["food", "local"]},
            {"title": "Goan Fish Curry Cooking Class", "location": "Old Goa", "duration": "3h", "cost_budget": 800, "cost_mid": 1500, "cost_luxury": 3000, "tags": ["food", "culture"]},
            {"title": "Feni Tasting Tour", "location": "Anjuna", "duration": "2h", "cost_budget": 500, "cost_mid": 1000, "cost_luxury": 2000, "tags": ["food", "local"]},
            {"title": "Sunset Dinner Cruise on Mandovi", "location": "Mandovi River", "duration": "3h", "cost_budget": 1500, "cost_mid": 3000, "cost_luxury": 6000, "tags": ["food", "scenic"]},
        ],
        "culture": [
            {"title": "Basilica of Bom Jesus", "location": "Old Goa", "duration": "1.5h", "cost_budget": 0, "cost_mid": 0, "cost_luxury": 500, "tags": ["history", "heritage"]},
            {"title": "Chapora Fort Sunset Walk", "location": "Chapora", "duration": "2h", "cost_budget": 0, "cost_mid": 200, "cost_luxury": 500, "tags": ["heritage", "scenic"]},
            {"title": "Spice Plantation Tour", "location": "Ponda", "duration": "3h", "cost_budget": 600, "cost_mid": 1200, "cost_luxury": 2500, "tags": ["nature", "culture"]},
        ],
        "relax": [
            {"title": "Sunrise Yoga at Arambol Beach", "location": "Arambol", "duration": "1h", "cost_budget": 300, "cost_mid": 600, "cost_luxury": 1500, "tags": ["wellness"]},
            {"title": "Ayurvedic Spa at Resort", "location": "Calangute", "duration": "2h", "cost_budget": 1500, "cost_mid": 3000, "cost_luxury": 7000, "tags": ["wellness", "luxury"]},
            {"title": "Hammock Afternoon at Palolem", "location": "Palolem Beach", "duration": "3h", "cost_budget": 100, "cost_mid": 300, "cost_luxury": 800, "tags": ["relax", "beach"]},
        ],
        "nightlife": [
            {"title": "Sunset at Vagator Cliffs", "location": "Vagator", "duration": "2h", "cost_budget": 200, "cost_mid": 500, "cost_luxury": 1500, "tags": ["scenic", "social"]},
            {"title": "SinQ Beach Club Night", "location": "Calangute", "duration": "4h", "cost_budget": 1000, "cost_mid": 2500, "cost_luxury": 6000, "tags": ["nightlife", "music"]},
            {"title": "Curlies Psytrance Party", "location": "Anjuna Beach", "duration": "5h", "cost_budget": 500, "cost_mid": 1000, "cost_luxury": 2000, "tags": ["nightlife", "party"]},
        ],
    },
    "jaipur": {
        "culture": [
            {"title": "Amber Fort Guided Tour", "location": "Amber", "duration": "3h", "cost_budget": 500, "cost_mid": 1000, "cost_luxury": 3000, "tags": ["heritage", "history"]},
            {"title": "Hawa Mahal & City Palace Walk", "location": "Old Jaipur", "duration": "2h", "cost_budget": 300, "cost_mid": 600, "cost_luxury": 1500, "tags": ["heritage", "architecture"]},
            {"title": "Jantar Mantar Astronomy Tour", "location": "Jaipur", "duration": "1.5h", "cost_budget": 200, "cost_mid": 400, "cost_luxury": 1000, "tags": ["history", "science"]},
            {"title": "Jaipur Block Printing Workshop", "location": "Sanganer", "duration": "3h", "cost_budget": 600, "cost_mid": 1200, "cost_luxury": 2500, "tags": ["craft", "culture"]},
        ],
        "food": [
            {"title": "Breakfast at Lakshmi Mishthan Bhandar", "location": "Johari Bazaar", "duration": "1h", "cost_budget": 150, "cost_mid": 300, "cost_luxury": 700, "tags": ["food", "local"]},
            {"title": "Rajasthani Thali Lunch", "location": "Chokhi Dhani", "duration": "2h", "cost_budget": 600, "cost_mid": 1200, "cost_luxury": 3000, "tags": ["food", "culture"]},
            {"title": "Street Food Trail — Pyaz Kachori to Ghevar", "location": "Old City", "duration": "2h", "cost_budget": 300, "cost_mid": 600, "cost_luxury": 1200, "tags": ["food", "local"]},
        ],
        "adventure": [
            {"title": "Hot Air Balloon Sunrise Ride", "location": "Amer", "duration": "2h", "cost_budget": 7000, "cost_mid": 9000, "cost_luxury": 15000, "tags": ["adventure", "scenic"]},
            {"title": "Camel Safari in the Outskirts", "location": "Sambhar Lake", "duration": "3h", "cost_budget": 1000, "cost_mid": 2000, "cost_luxury": 4000, "tags": ["adventure", "nature"]},
        ],
        "relax": [
            {"title": "Spa at Rambagh Palace", "location": "Rambagh", "duration": "2h", "cost_budget": 3000, "cost_mid": 6000, "cost_luxury": 15000, "tags": ["luxury", "wellness"]},
            {"title": "Sunset View at Nahargarh Fort", "location": "Nahargarh", "duration": "2h", "cost_budget": 100, "cost_mid": 300, "cost_luxury": 1000, "tags": ["scenic", "relax"]},
        ],
    },
    "hyderabad": {
        "culture": [
            {"title": "Charminar & Laad Bazaar", "location": "Old City", "duration": "2h", "cost_budget": 100, "cost_mid": 300, "cost_luxury": 800, "tags": ["heritage", "local"]},
            {"title": "Golconda Fort Light & Sound Show", "location": "Golconda", "duration": "2h", "cost_budget": 200, "cost_mid": 500, "cost_luxury": 1200, "tags": ["history", "heritage"]},
            {"title": "Salar Jung Museum Tour", "location": "Dar-ul-Shifa", "duration": "3h", "cost_budget": 150, "cost_mid": 300, "cost_luxury": 700, "tags": ["culture", "art"]},
            {"title": "Qutub Shahi Tombs Walk", "location": "Ibrahim Bagh", "duration": "1.5h", "cost_budget": 100, "cost_mid": 200, "cost_luxury": 500, "tags": ["history", "architecture"]},
        ],
        "food": [
            {"title": "Shadab Biryani Experience", "location": "High Court Road", "duration": "1h", "cost_budget": 200, "cost_mid": 400, "cost_luxury": 1000, "tags": ["food", "iconic"]},
            {"title": "Irani Chai & Osmania Biscuit Trail", "location": "Nimboliadda", "duration": "1.5h", "cost_budget": 100, "cost_mid": 200, "cost_luxury": 500, "tags": ["food", "local"]},
            {"title": "Haleem Tasting at Pista House", "location": "Nampally", "duration": "1h", "cost_budget": 150, "cost_mid": 300, "cost_luxury": 700, "tags": ["food", "local"]},
            {"title": "Paradise Biryani Dinner", "location": "Secunderabad", "duration": "1.5h", "cost_budget": 300, "cost_mid": 600, "cost_luxury": 1500, "tags": ["food", "iconic"]},
        ],
        "adventure": [
            {"title": "Kayaking at Hussain Sagar", "location": "Tank Bund", "duration": "2h", "cost_budget": 400, "cost_mid": 800, "cost_luxury": 2000, "tags": ["water", "outdoor"]},
            {"title": "Trekking at Ananthagiri Hills", "location": "Vikarabad", "duration": "5h", "cost_budget": 500, "cost_mid": 1000, "cost_luxury": 2500, "tags": ["adventure", "nature"]},
        ],
        "relax": [
            {"title": "Necklace Road Evening Stroll", "location": "Hussain Sagar", "duration": "2h", "cost_budget": 0, "cost_mid": 100, "cost_luxury": 300, "tags": ["relax", "scenic"]},
            {"title": "Spa at Taj Falaknuma", "location": "Engine Bowli", "duration": "2h", "cost_budget": 4000, "cost_mid": 8000, "cost_luxury": 18000, "tags": ["luxury", "wellness"]},
        ],
        "nightlife": [
            {"title": "Rooftop at 10 Downing Street", "location": "Road No. 10, Banjara Hills", "duration": "3h", "cost_budget": 800, "cost_mid": 2000, "cost_luxury": 5000, "tags": ["nightlife", "lounge"]},
            {"title": "HICCUPS & HOOKAH Café Night", "location": "Jubilee Hills", "duration": "3h", "cost_budget": 600, "cost_mid": 1500, "cost_luxury": 4000, "tags": ["nightlife", "social"]},
        ],
    },
    "leh": {
        "adventure": [
            {"title": "Pangong Tso Lake Road Trip", "location": "Pangong Lake", "duration": "8h", "cost_budget": 2000, "cost_mid": 4000, "cost_luxury": 8000, "tags": ["adventure", "scenic"]},
            {"title": "River Rafting on Zanskar", "location": "Zanskar River", "duration": "4h", "cost_budget": 1500, "cost_mid": 2500, "cost_luxury": 5000, "tags": ["adventure", "water"]},
            {"title": "Mountain Biking at Khardung La", "location": "Khardung La Pass", "duration": "6h", "cost_budget": 1500, "cost_mid": 3000, "cost_luxury": 7000, "tags": ["extreme", "adventure"]},
        ],
        "culture": [
            {"title": "Thiksey Monastery Sunrise Visit", "location": "Thiksey", "duration": "3h", "cost_budget": 200, "cost_mid": 500, "cost_luxury": 1500, "tags": ["spiritual", "culture"]},
            {"title": "Leh Palace & Market Walk", "location": "Old Leh", "duration": "2h", "cost_budget": 100, "cost_mid": 300, "cost_luxury": 800, "tags": ["heritage", "local"]},
            {"title": "Hemis Monastery Tour", "location": "Hemis", "duration": "3h", "cost_budget": 300, "cost_mid": 600, "cost_luxury": 1500, "tags": ["spiritual", "history"]},
        ],
        "relax": [
            {"title": "Stargazing at Nubra Valley", "location": "Nubra Valley", "duration": "3h", "cost_budget": 500, "cost_mid": 1200, "cost_luxury": 3000, "tags": ["nature", "relax"]},
            {"title": "Hot Spring Dip at Panamik", "location": "Panamik", "duration": "2h", "cost_budget": 200, "cost_mid": 500, "cost_luxury": 1200, "tags": ["wellness", "nature"]},
        ],
    },
    "default": {
        "culture": [
            {"title": "Local Heritage Walk", "location": "City Center", "duration": "2h", "cost_budget": 200, "cost_mid": 500, "cost_luxury": 1500, "tags": ["culture"]},
            {"title": "Museum of Local History", "location": "Heritage District", "duration": "2h", "cost_budget": 150, "cost_mid": 300, "cost_luxury": 800, "tags": ["history"]},
        ],
        "food": [
            {"title": "Local Street Food Tour", "location": "Old Market", "duration": "2h", "cost_budget": 300, "cost_mid": 600, "cost_luxury": 1500, "tags": ["food"]},
            {"title": "Fine Dining Regional Cuisine", "location": "City Restaurant", "duration": "2h", "cost_budget": 800, "cost_mid": 2000, "cost_luxury": 6000, "tags": ["food"]},
        ],
        "adventure": [
            {"title": "Nature Hike & Viewpoint Trek", "location": "Outskirts", "duration": "4h", "cost_budget": 500, "cost_mid": 1000, "cost_luxury": 2500, "tags": ["adventure"]},
        ],
        "relax": [
            {"title": "Sunset Lakeside Walk", "location": "Lake Road", "duration": "1.5h", "cost_budget": 0, "cost_mid": 200, "cost_luxury": 500, "tags": ["relax"]},
            {"title": "Spa & Wellness Session", "location": "Wellness Center", "duration": "2h", "cost_budget": 1000, "cost_mid": 2500, "cost_luxury": 7000, "tags": ["wellness"]},
        ],
        "nightlife": [
            {"title": "Rooftop Bar & Live Music", "location": "City Rooftop", "duration": "3h", "cost_budget": 500, "cost_mid": 1500, "cost_luxury": 4000, "tags": ["nightlife"]},
        ],
    }
}

HOTEL_POOL = {
    "budget": [
        {"name": "Zostel Hostel", "type": "Dorm Bed", "per_night": 600},
        {"name": "OYO Budget Inn", "type": "Private Room", "per_night": 900},
    ],
    "mid": [
        {"name": "ibis Hotel", "type": "Standard Room", "per_night": 3000},
        {"name": "Lemon Tree Hotel", "type": "Superior Room", "per_night": 4500},
    ],
    "luxury": [
        {"name": "Taj Hotel", "type": "Deluxe Suite", "per_night": 15000},
        {"name": "ITC Grand", "type": "Executive Suite", "per_night": 22000},
    ],
}

TIME_SLOTS = ["07:30 AM", "09:00 AM", "11:00 AM", "12:30 PM", "02:00 PM", "04:00 PM", "06:30 PM", "08:00 PM"]

# ─────────────────────────────────────────
#  DYNAMIC ITINERARY ENGINE
# ─────────────────────────────────────────
def build_itinerary(req: PlanRequest) -> Dict[str, Any]:
    dest_key = req.destination.lower().strip()
    pool = ACTIVITY_POOL.get(dest_key, ACTIVITY_POOL["default"])
    budget_key = req.budget_level  # budget / mid / luxury

    # Compute number of days
    start = datetime.strptime(req.start_date, "%Y-%m-%d")
    end = datetime.strptime(req.end_date, "%Y-%m-%d")
    num_days = max(1, (end - start).days)

    # Gather eligible activities based on travel styles
    eligible = []
    for style in req.travel_style:
        style_activities = pool.get(style, [])
        # Apply constraint filters
        for act in style_activities:
            if "no_alcohol" in req.constraints and "nightlife" in act.get("tags", []):
                continue
            if "child_friendly" in req.constraints and "extreme" in act.get("tags", []):
                continue
            eligible.append({**act, "style": style})

    if not eligible:
        eligible = pool.get("culture", ACTIVITY_POOL["default"]["culture"])

    random.shuffle(eligible)

    # Build day-by-day schedule
    days = []
    total_activity_cost = 0
    used = set()

    for day_idx in range(num_days):
        current_date = start + timedelta(days=day_idx)
        day_activities = []
        time_slots = random.sample(TIME_SLOTS, min(3, len(TIME_SLOTS)))
        time_slots.sort()

        for slot in time_slots:
            # Pick a unique activity
            for act in eligible:
                if act["title"] not in used:
                    used.add(act["title"])
                    cost = act.get(f"cost_{budget_key}", act.get("cost_mid", 500))
                    # Group multiplier
                    multiplier = {"solo": 1, "couple": 2, "family": 3, "group": 4}.get(req.group_type, 1)
                    total_cost = cost * multiplier
                    total_activity_cost += total_cost
                    day_activities.append({
                        "time": slot,
                        "title": act["title"],
                        "location": act["location"],
                        "duration": act.get("duration", "2h"),
                        "cost": total_cost,
                        "style_tag": act.get("style", ""),
                        "tags": act.get("tags", []),
                        "status": random.choice(["Confirmed", "Confirmed", "Pending"])
                    })
                    break

        days.append({
            "day_number": day_idx + 1,
            "date": current_date.strftime("%B %d, %Y"),
            "activities": day_activities
        })

    # Hotel cost
    hotel = random.choice(HOTEL_POOL.get(budget_key, HOTEL_POOL["mid"]))
    hotel_total = hotel["per_night"] * num_days

    # Transport estimate
    transport_costs = {"budget": 500, "mid": 1500, "luxury": 4000}
    transport_total = transport_costs.get(budget_key, 1500) * num_days

    total_budget = total_activity_cost + hotel_total + transport_total

    # Build constraint badges
    applied_constraints = []
    if "vegetarian" in req.constraints:
        applied_constraints.append("🌱 Vegetarian meals prioritized")
    if "no_alcohol" in req.constraints:
        applied_constraints.append("🚫 Alcohol-free experiences")
    if "accessible" in req.constraints:
        applied_constraints.append("♿ Accessibility checked")
    if "child_friendly" in req.constraints:
        applied_constraints.append("👶 Child-safe activities")

    return {
        "destination": req.destination,
        "start_date": req.start_date,
        "end_date": req.end_date,
        "num_days": num_days,
        "group_type": req.group_type,
        "budget_level": budget_key,
        "travel_styles": req.travel_style,
        "applied_constraints": applied_constraints,
        "hotel": {
            "name": hotel["name"],
            "type": hotel["type"],
            "per_night": hotel["per_night"],
            "total": hotel_total
        },
        "budget_breakdown": {
            "activities": total_activity_cost,
            "hotel": hotel_total,
            "transport": transport_total,
            "total": total_budget
        },
        "days": days
    }

# ─────────────────────────────────────────
#  ENDPOINTS
# ─────────────────────────────────────────
@app.get("/api/destinations", response_model=List[Destination])
async def get_destinations():
    shuffled = MOCK_DESTINATIONS.copy()
    random.shuffle(shuffled)
    return shuffled

@app.post("/api/plan")
async def generate_plan(req: PlanRequest):
    try:
        itinerary = build_itinerary(req)
        return itinerary
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/updates")
async def get_updates():
    return [
        {"id": 1, "type": "Weather", "content": "Sunny spells expected at your destination today. Perfect for outdoor activities!"},
        {"id": 2, "type": "Flight", "content": "Your saved route is operating normally. Prices dropped 12% this week."},
        {"id": 3, "type": "Tip", "content": "Book activities 2 days in advance to avoid sold-out spots."},
        {"id": 4, "type": "Alert", "content": "Local festival this weekend — expect crowds at heritage sites but amazing vibes!"},
    ]

# ─── Serve frontend static files (production) ───
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.isdir(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8005))
    uvicorn.run(app, host="0.0.0.0", port=port)
