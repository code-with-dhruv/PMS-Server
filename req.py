import requests
import json

BASE_URL = "http://localhost:3000"

# Test 1: Search for assets
def test_search_assets(query):
    try:
        response = requests.get(f"{BASE_URL}/api/search/{query}")
        print(f"Search Assets ({query}): {response.status_code}")
        print(json.dumps(response.json(), indent=2))
    except requests.RequestException as e:
        print(f"Error searching assets: {e}")

# Test 2: Fetch real-time quote
def test_get_quote(symbol):
    try:
        response = requests.get(f"{BASE_URL}/api/quote/{symbol}")
        print(f"Get Quote ({symbol}): {response.status_code}")
        print(json.dumps(response.json(), indent=2))
    except requests.RequestException as e:
        print(f"Error fetching quote: {e}")

# Test 3: Create a transaction (buy/sell)
def test_create_transaction(user_id, symbol, quantity, transaction_type, asset_type):
    payload = {
        "user_id": user_id,
        "symbol": symbol,
        "quantity": quantity,
        "type": transaction_type,
        "asset_type": asset_type
    }
    try:
        response = requests.post(f"{BASE_URL}/api/transactions", json=payload)
        print(f"Create Transaction: {response.status_code}")
        print(json.dumps(response.json(), indent=2))
    except requests.RequestException as e:
        print(f"Error creating transaction: {e}")

# Test 4: Get portfolio with diversification
def test_get_portfolio(user_id):
    try:
        response = requests.get(f"{BASE_URL}/api/portfolio/{user_id}")
        print(f"Get Portfolio ({user_id}): {response.status_code}")
        print(json.dumps(response.json(), indent=2))
    except requests.RequestException as e:
        print(f"Error fetching portfolio: {e}")

# Test 5: Get all transactions
def test_get_all_transactions():
    try:
        response = requests.get(f"{BASE_URL}/api/transactions")
        print(f"Get All Transactions: {response.status_code}")
        print(json.dumps(response.json(), indent=2))
    except requests.RequestException as e:
        print(f"Error fetching transactions: {e}")

# Test 6: Get user transactions
def test_get_user_transactions(user_id):
    try:
        response = requests.get(f"{BASE_URL}/api/transactions/{user_id}")
        print(f"Get User Transactions ({user_id}): {response.status_code}")
        print(json.dumps(response.json(), indent=2))
    except requests.RequestException as e:
        print(f"Error fetching user transactions: {e}")

# Test 7: Update a transaction
def test_update_transaction(transaction_id, quantity, transaction_type, asset_type):
    payload = {
        "quantity": quantity,
        "type": transaction_type,
        "asset_type": asset_type
    }
    try:
        response = requests.put(f"{BASE_URL}/api/transactions/{transaction_id}", json=payload)
        print(f"Update Transaction ({transaction_id}): {response.status_code}")
        print(json.dumps(response.json(), indent=2))
    except requests.RequestException as e:
        print(f"Error updating transaction: {e}")

# Test 8: Delete a transaction
def test_delete_transaction(transaction_id):
    try:
        response = requests.delete(f"{BASE_URL}/api/transactions/{transaction_id}")
        print(f"Delete Transaction ({transaction_id}): {response.status_code}")
        print(json.dumps(response.json(), indent=2))
    except requests.RequestException as e:
        print(f"Error deleting transaction: {e}")

# Test 9: Get settlement account balance
def test_get_settlement_balance(user_id):
    try:
        response = requests.get(f"{BASE_URL}/api/settlement/{user_id}")
        print(f"Get Settlement Balance ({user_id}): {response.status_code}")
        print(json.dumps(response.json(), indent=2))
    except requests.RequestException as e:
        print(f"Error fetching settlement balance: {e}")

# Test 10: Initialize/Update settlement account balance
def test_update_settlement_balance(user_id, balance):
    payload = {"balance": balance}
    try:
        response = requests.post(f"{BASE_URL}/api/settlement/{user_id}", json=payload)
        print(f"Update Settlement Balance ({user_id}): {response.status_code}")
        print(json.dumps(response.json(), indent=2))
    except requests.RequestException as e:
        print(f"Error updating settlement balance: {e}")

# Test 11: Erase all data (use with caution)
def test_erase_all_data():
    try:
        response = requests.delete(f"{BASE_URL}/api/erase")
        print(f"Erase All Data: {response.status_code}")
        print(json.dumps(response.json(), indent=2))
    except requests.RequestException as e:
        print(f"Error erasing data: {e}")

# Example usage
if __name__ == "__main__":
    # Initialize settlement account
    test_update_settlement_balance("user123", 10000.0)  # Set initial balance

    # Search for assets
    test_search_assets("AAPL")

    # Fetch real-time quote
    test_get_quote("AAPL")

    # Create transactions
    test_create_transaction("user123", "AAPL", 10, "buy", "stock")
    test_create_transaction("user123", "TLT", 5, "buy", "bond")
    test_create_transaction("user123", "VTSAX", 8, "buy", "mutual_fund")

    # Get portfolio with diversification
    test_get_portfolio("user123")

    # Get all transactions
    test_get_all_transactions()

    # Get user transactions
    test_get_user_transactions("user123")

    # Update a transaction (use a valid transaction_id from previous responses)
    test_update_transaction(1, 15, "buy", "stock")

    # Delete a transaction (use a valid transaction_id)
    test_delete_transaction(1)

    # Get settlement balance
    test_get_settlement_balance("user123")

    # Erase all data (uncomment to test, use with caution)
    # test_erase_all_data()