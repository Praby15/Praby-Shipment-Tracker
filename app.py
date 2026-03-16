import pandas as pd
import plotly.express as px
import streamlit as st
from anthropic import Anthropic


def format_inr(value: float) -> str:
    amount = int(round(value))
    sign = "-" if amount < 0 else ""
    amount = abs(amount)

    s = str(amount)
    if len(s) <= 3:
        return f"{sign}{s}"

    last_three = s[-3:]
    rest = s[:-3]
    parts = []
    while len(rest) > 2:
        parts.insert(0, rest[-2:])
        rest = rest[:-2]
    if rest:
        parts.insert(0, rest)

    return f"{sign}{','.join(parts)},{last_three}"


def get_shipment_data() -> pd.DataFrame:
    data = [
        ("SHP-IND-1001", "Nhava Sheva", "Dubai", "Maersk", "FCL", "In Transit", 185000, 191500, "2026-03-03", "2026-03-19"),
        ("SHP-IND-1002", "Mundra", "Singapore", "MSC", "FCL", "Delivered", 210000, 205000, "2026-02-20", "2026-03-08"),
        ("SHP-IND-1003", "Chennai", "Colombo", "OOCL", "LCL", "Delivered", 62000, 65500, "2026-02-24", "2026-03-05"),
        ("SHP-IND-1004", "Kolkata", "Bangkok", "Maersk", "LCL", "Delayed", 74000, 89200, "2026-02-26", "2026-03-14"),
        ("SHP-IND-1005", "Cochin", "Jebel Ali", "MSC", "FCL", "In Transit", 168000, 172000, "2026-03-05", "2026-03-21"),
        ("SHP-IND-1006", "Nhava Sheva", "Rotterdam", "Maersk", "FCL", "Pending", 355000, 350000, "2026-03-18", "2026-04-09"),
        ("SHP-IND-1007", "Mundra", "Hamburg", "MSC", "FCL", "In Transit", 332000, 340000, "2026-03-01", "2026-03-25"),
        ("SHP-IND-1008", "Chennai", "Kuala Lumpur", "DHL", "Air", "Delivered", 148000, 154000, "2026-03-06", "2026-03-09"),
        ("SHP-IND-1009", "Kolkata", "Dhaka", "Air India Cargo", "Air", "Delivered", 39000, 37200, "2026-03-07", "2026-03-08"),
        ("SHP-IND-1010", "Cochin", "Doha", "DHL", "Air", "In Transit", 92000, 94000, "2026-03-10", "2026-03-13"),
        ("SHP-IND-1011", "Nhava Sheva", "New York", "Maersk", "FCL", "Delayed", 498000, 500000, "2026-02-15", "2026-03-18"),
        ("SHP-IND-1012", "Mundra", "Jeddah", "OOCL", "LCL", "Delivered", 88000, 84500, "2026-02-28", "2026-03-12"),
        ("SHP-IND-1013", "Chennai", "Sharjah", "MSC", "LCL", "In Transit", 79000, 81200, "2026-03-08", "2026-03-17"),
        ("SHP-IND-1014", "Kolkata", "Ho Chi Minh City", "OOCL", "LCL", "Pending", 97000, 96500, "2026-03-20", "2026-03-30"),
        ("SHP-IND-1015", "Cochin", "Muscat", "Maersk", "FCL", "Delivered", 152000, 149500, "2026-02-22", "2026-03-06"),
        ("SHP-IND-1016", "Nhava Sheva", "Nairobi", "DHL", "Air", "In Transit", 126000, 130000, "2026-03-11", "2026-03-15"),
        ("SHP-IND-1017", "Mundra", "Durban", "MSC", "FCL", "Delayed", 286000, 301000, "2026-02-19", "2026-03-16"),
        ("SHP-IND-1018", "Chennai", "Sydney", "Air India Cargo", "Air", "Pending", 178000, 175000, "2026-03-22", "2026-03-25"),
        ("SHP-IND-1019", "Kolkata", "London", "DHL", "Air", "Delivered", 244000, 252000, "2026-03-02", "2026-03-05"),
        ("SHP-IND-1020", "Cochin", "Singapore", "OOCL", "LCL", "In Transit", 69000, 70800, "2026-03-09", "2026-03-18"),
    ]

    columns = [
        "shipment_id",
        "origin",
        "destination",
        "carrier",
        "mode",
        "status",
        "estimated_cost_inr",
        "actual_cost_inr",
        "dispatch_date",
        "eta",
    ]

    df = pd.DataFrame(data, columns=columns)
    df["dispatch_date"] = pd.to_datetime(df["dispatch_date"])
    df["eta"] = pd.to_datetime(df["eta"])
    return df


def ask_claude_about_shipments(question: str, filtered_df: pd.DataFrame) -> str:
    api_key = st.secrets.get("ANTHROPIC_API_KEY")
    if not api_key:
        return "⚠️ Anthropic API key not configured. Add ANTHROPIC_API_KEY to Streamlit secrets."

    client = Anthropic()

    shipment_summary = filtered_df.to_string()

    prompt = f"""You are a freight shipment analyst. A user has asked a question about their shipments.
Here is the shipment data:

{shipment_summary}

User Question: {question}

Provide a concise, actionable answer based on the shipment data. Focus on insights about costs, delays, carriers, and routes."""

    try:
        message = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text
    except Exception as e:
        return f"❌ Error querying Claude: {str(e)}"


def main() -> None:
    st.set_page_config(page_title="Indian Freight Shipments", page_icon="🚢", layout="wide")

    st.markdown("<h1 style='text-align: left; margin-bottom: 0rem; color: #1f4e79;'>🚢 Indian Freight Shipments</h1>", unsafe_allow_html=True)
    st.markdown("<p style='color: #666; font-size: 1rem; margin-bottom: 1.5rem;'>Real-time shipment tracking and cost analytics</p>", unsafe_allow_html=True)

    df = get_shipment_data()

    st.sidebar.markdown("<h3 style='color: #1f4e79;'>🔍 Filters</h3>", unsafe_allow_html=True)
    st.sidebar.markdown("---")

    mode_options = ["FCL", "LCL", "Air"]
    selected_modes = st.sidebar.multiselect("Mode", options=mode_options, default=mode_options)

    status_options = sorted(df["status"].unique().tolist())
    selected_statuses = st.sidebar.multiselect("Status", options=status_options, default=status_options)

    carrier_options = sorted(df["carrier"].unique().tolist())
    selected_carriers = st.sidebar.multiselect("Carrier", options=carrier_options, default=carrier_options)

    filtered_df = df[
        df["mode"].isin(selected_modes)
        & df["status"].isin(selected_statuses)
        & df["carrier"].isin(selected_carriers)
    ]

    total_shipments = len(filtered_df)
    total_estimated_cost = filtered_df["estimated_cost_inr"].sum()
    total_actual_cost = filtered_df["actual_cost_inr"].sum()
    delayed_shipments = (filtered_df["status"] == "Delayed").sum()

    col1, col2, col3, col4 = st.columns(4, gap="medium")
    col1.metric("Total Shipments", total_shipments, help="Total number of shipments in current view")
    col2.metric("Estimated Cost", f"₹ {format_inr(total_estimated_cost)}", help="Total estimated shipment cost")
    col3.metric("Actual Cost", f"₹ {format_inr(total_actual_cost)}", help="Total actual shipment cost")
    col4.metric("Delayed Shipments", delayed_shipments, help="Number of shipments with delayed status")

    st.markdown("<h3 style='margin-top: 2rem; margin-bottom: 1.5rem; color: #1f4e79;'>📊 Analytics Overview</h3>", unsafe_allow_html=True)

    cost_by_carrier = (
        filtered_df.groupby("carrier", as_index=False)[["estimated_cost_inr", "actual_cost_inr"]]
        .sum()
        .sort_values("estimated_cost_inr", ascending=False)
    )
    cost_by_carrier_long = cost_by_carrier.melt(
        id_vars="carrier",
        value_vars=["estimated_cost_inr", "actual_cost_inr"],
        var_name="cost_type",
        value_name="amount",
    )
    cost_by_carrier_long["cost_type"] = cost_by_carrier_long["cost_type"].map(
        {
            "estimated_cost_inr": "Estimated Cost",
            "actual_cost_inr": "Actual Cost",
        }
    )

    mode_counts = filtered_df["mode"].value_counts().rename_axis("mode").reset_index(name="count")
    status_counts = filtered_df["status"].value_counts().rename_axis("status").reset_index(name="count")

    fig_cost = px.bar(
        cost_by_carrier_long,
        x="carrier",
        y="amount",
        color="cost_type",
        barmode="group",
        labels={"carrier": "Carrier", "amount": "Cost (INR)", "cost_type": "Cost Type"},
        color_discrete_map={"Estimated Cost": "#1f4e79", "Actual Cost": "#2e8b57"},
        title="Estimated vs Actual Cost by Carrier",
    )
    fig_cost.update_layout(hovermode="x unified", height=400, template="plotly_white")

    fig_mode = px.pie(
        mode_counts,
        names="mode",
        values="count",
        color="mode",
        color_discrete_map={"FCL": "#1f4e79", "LCL": "#4c78a8", "Air": "#2e8b57"},
        title="Shipments by Mode",
    )
    fig_mode.update_layout(height=400, template="plotly_white")

    fig_status = px.bar(
        status_counts,
        x="status",
        y="count",
        color="status",
        labels={"status": "Status", "count": "Shipment Count"},
        color_discrete_map={
            "In Transit": "#4c78a8",
            "Delivered": "#2e8b57",
            "Delayed": "#b22222",
            "Pending": "#8c8c8c",
        },
        title="Shipment Count by Status",
    )
    fig_status.update_layout(hovermode="x unified", height=400, template="plotly_white")

    chart_col1, chart_col2, chart_col3 = st.columns(3, gap="medium")
    with chart_col1:
        st.plotly_chart(fig_cost, use_container_width=True, config={"displayModeBar": False})
    with chart_col2:
        st.plotly_chart(fig_mode, use_container_width=True, config={"displayModeBar": False})
    with chart_col3:
        st.plotly_chart(fig_status, use_container_width=True, config={"displayModeBar": False})

    st.markdown("<h3 style='margin-top: 2rem; margin-bottom: 1.5rem; color: #1f4e79;'>📋 Shipment Details</h3>", unsafe_allow_html=True)

    def highlight_overruns(row: pd.Series) -> list[str]:
        overrun = row["actual_cost_inr"] > row["estimated_cost_inr"]
        return ["background-color: #fff3cd" if overrun else "" for _ in row]

    styled_filtered_df = filtered_df.style.apply(highlight_overruns, axis=1)

    st.dataframe(styled_filtered_df, use_container_width=True, height=400)
    st.caption("⚠️ Yellow rows indicate cost overruns (Actual > Estimated)")

    st.markdown("<h3 style='margin-top: 2rem; margin-bottom: 1.5rem; color: #1f4e79;'>🤖 AI Shipment Assistant</h3>", unsafe_allow_html=True)
    st.markdown("Ask Claude AI questions about your shipments using natural language.")

    col_question, col_ask = st.columns([5, 1])
    with col_question:
        user_question = st.text_input(
            label="Ask a question about your shipments:",
            placeholder="e.g., Which carriers have the most delayed shipments? What's the average cost overrun?",
            label_visibility="collapsed",
        )
    with col_ask:
        ask_button = st.button("🔍 Ask", use_container_width=True)

    if ask_button and user_question:
        with st.spinner("🤔 Claude is thinking..."):
            response = ask_claude_about_shipments(user_question, filtered_df)
        st.markdown("<div style='background-color: #f0f4ff; padding: 1.5rem; border-radius: 8px; border-left: 4px solid #1f4e79;'>", unsafe_allow_html=True)
        st.markdown(response)
        st.markdown("</div>", unsafe_allow_html=True)
    elif ask_button and not user_question:
        st.warning("Please enter a question to ask Claude.")

    csv_data = filtered_df.to_csv(index=False).encode("utf-8")
    col_download, col_spacer = st.columns([2, 8])
    with col_download:
        st.download_button(
            label="📥 Download as CSV",
            data=csv_data,
            file_name="filtered_shipments.csv",
            mime="text/csv",
            use_container_width=True,
        )
    st.markdown("---")
    st.markdown("<p style='text-align: center; color: #999; font-size: 0.9rem; margin-top: 2rem;'>🚢 Indian Freight Dashboard | Real-time Tracking & Analytics</p>", unsafe_allow_html=True)


if __name__ == "__main__":
    main()
