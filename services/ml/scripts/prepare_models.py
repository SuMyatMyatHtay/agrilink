"""Build-time model preparation. Runtime Vercel instances only load these files."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.modules.supply_demand import model as supply_demand
from app.modules.price import model as price
from app.modules.cost import model as cost

if __name__ == "__main__":
    for name, model in (("supply_demand", supply_demand), ("price", price), ("cost", cost)):
        model.train()
        if not model.ARTIFACT.is_file():
            raise RuntimeError(f"Model artifact was not created: {name}")
        print(f"Prepared {name} model")
