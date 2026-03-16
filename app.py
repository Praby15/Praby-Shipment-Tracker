import pandas as pd
import plotly.express as px
import streamlit as st


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


def main() -> None:
    st.set_page_config(page_title="Indian Freight Shipments", page_icon="🚢", layout="wide")

    st.title("Indian Freight Shipments")
    st.caption("Real-time shipment tracking and cost analytics")

    df = get_shipment_data()

    st.sidebar.header("Filters")

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

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total Shipments", f"{total_shipments}")
    col2.metric("Total Estimated Cost (INR)", f"{format_inr(total_estimated_cost)}")
    col3.metric("Total Actual Cost (INR)", f"{format_inr(total_actual_cost)}")
    col4.metric("Delayed Shipments", f"{delayed_shipments}")

    st.divider()

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

    fig_mode = px.pie(
        mode_counts,
        names="mode",
        values="count",
        color="mode",
        color_discrete_map={"FCL": "#1f4e79", "LCL": "#4c78a8", "Air": "#2e8b57"},
        title="Shipments by Mode",
    )

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

    chart_col1, chart_col2, chart_col3 = st.columns(3)
    chart_col1.plotly_chart(fig_cost, use_container_width=True)
    chart_col2.plotly_chart(fig_mode, use_container_width=True)
    chart_col3.plotly_chart(fig_status, use_container_width=True)

    def highlight_overruns(row: pd.Series) -> list[str]:
        overrun = row["actual_cost_inr"] > row["estimated_cost_inr"]
        return ["background-color: #ffe6e6" if overrun else "" for _ in row]

    styled_filtered_df = filtered_df.style.apply(highlight_overruns, axis=1)

    st.subheader("Filtered Shipment Data")
    st.dataframe(styled_filtered_df, use_container_width=True)

    csv_data = filtered_df.to_csv(index=False).encode("utf-8")
    st.download_button(
        label="Download Filtered Data as CSV",
        data=csv_data,
        file_name="filtered_shipments.csv",
        mime="text/csv",
    )


if __name__ == "__main__":
    main()
