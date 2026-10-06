# Fleet Maintenance: how to use it

A guide for the people who use the app day to day at Achieve Cafe Provisions. For how it's built and set up, see [README.md](README.md) and [NOTES.md](NOTES.md).

## Opening the app

The app runs on the **orders PC**, next to NPD Tracker. Open it with Tailscale on your laptop or phone:

| Open this | |
|---|---|
| **http://100.66.249.69:8002** | the orders PC's Tailscale address |
| **http://orders-hostcomputer:8002** | the same, by name |

Sign in with the shared office login. After an update, press **Ctrl + F5** once so the browser loads the new version.

Every page has its own address, so you can bookmark a page or send a link to it, for example `…:8002/vans` or `…:8002/services/incidents`. All dates are shown as dd-mm-yyyy, and all dates and times are Sydney time (including daylight saving), whatever time zone your computer or phone is set to.

## The screen at a glance

- **Blue bar:** Google Sheet (a read-only copy of everything) and Log out.
- **Tabs:** Home · Vans · Services · Washes · Fuel · Reports.
- **Two buttons beside the tabs:** **Log wash** and **+ Log service**, the two things you do most.
- Every form opens as a pop-up over the page you're on. Close it with ✕ or Cancel.

## Home

Start here each day.

- **Three numbers:** how many things need doing, how many jobs are **booked or at the mechanic** (the note underneath names them), and what's been spent this month (services + fuel card).
- **Needs doing (left):** only things that need action, most urgent first: services or tyres due or overdue (once one is booked it leaves this list, and only comes back if the booked date passes without the work being done), rego/insurance expiring within 60 days, open incidents, invoices that are late (more than 6 weeks after the service), vans due a wash, and missing rego/insurance dates. Each line has a button for the next step.
- **Booked & at the mechanic (right):** work not finished yet. Change its status right there.
- **Waiting for invoices (right):** finished work. The mechanic sends each invoice about a month after the service, so this shows when each one is expected. When it arrives, click **Invoice arrived**, type the cost, and it's done.

## Services

### Booking a service
1. Click **+ Log service**.
2. Pick the **Van** and **What** (e.g. Scheduled service), the **Date** and **Status = Booked**.
3. Pick the **Mechanic**. For someone new, choose **+ Add new mechanic…** and type the name.
4. Click **+ More** to write **Issues for the mechanic** (e.g. "right brake light"). They show on Home and on the job. Underneath, **+ Add photo** adds photos of the problem (on a phone it can open the camera); click a photo to see it full size. They're kept in Google Drive in **Fleet Maintenance Photos › Services › van** (incidents: **› Incidents › van**), named by the job's date, e.g. 06-10-2026.jpg (**Open in Google Drive ↗**). A photo you drop into that folder in Drive, named with the job's date, shows up on that job too. Incidents have the same thing for **Photos of the damage**.
5. **Save record**.

### When the work is done
Change the job's status (on Home, the Services list or the van's page) to **Waiting for invoice** or **Done**. A small box asks for:
- **Odometer when serviced**: the next service is worked out for you (**km + 10,000**) and the van's odometer is updated.
- **Cost from the invoice**: keeps the spending figures right.
- **Mechanic**.

Don't have the figures yet? Click **Just change the status**, and fill them in later by opening the job.

### Statuses
**Booked** → **At mechanic** → **Waiting for invoice** → **Done**.

### The Services tab
- **Services:** every service, newest first, with columns Van, What, **Mechanic** (who did it), Status and Cost. Pick a van or search; more filters (type, status, mechanic, dates) are under **Filters ▾**. Click a row to see the details and which van it is.
- **Incidents:** accidents, breakdowns and damage. **Log incident** to add one; add **Photos of the damage** under the description (kept in Google Drive in **Fleet Maintenance Photos › Incidents › van**, named by the incident's date); open one to add follow-up notes, and to say what was done when it's resolved.
- **Mechanics:** the workshops you use, with their phone number, number of jobs, total spent and last job. **See jobs** lists everything a workshop did.

## Vans

- The list is in order of **next service, soonest first**. Overdue vans are at the top.
- **Next service** shows the km it's due at, with how far away it is underneath.
- Click a van to open its page:
  - **History:** services, fuel, washes and incidents in one list. Use the buttons to show just one kind.
  - **Fuel:** that van's fill-ups and card charges.
  - **Documents:** attach rego papers, insurance, invoices and photos (PDF, photo, Word or Excel, up to 20 MB). Files attached to a service or incident show here too.
  - **Details:** rego, VIN, fuel card, intervals, tyres, rego/insurance expiry, washing, usual driver, and the **change history** (who changed what, and when). **Edit details** and **Delete van** are here.
- Links at the top of the Vans list:
  - **Rego & insurance dates:** type or pick each van's two dates once; each saves when you click out of the box (or press Enter). Home then warns 60 days before anything expires.
  - **Drivers:** add drivers and choose each van's usual driver.
  - **Tyres:** when each van last had new tyres and when the next set is due. Set how many km a set lasts; **Log new tyres** records a tyre change.
  - **QR stickers:** print a sticker for each van. A driver scans it with their phone (on the office Wi-Fi) to **report a problem** or **log a wash**, with no login. Reports appear under Services → Incidents and on Home.
- **+ Add vehicle** is at the top of the Vans list.

## Washes

Vans are washed in-house every 2 weeks.
- **Due a wash:** press **Washed today** when one is done.
- **Washed recently:** the last 2 weeks. ✕ removes a wash logged by mistake.
- Vans that go home with their driver aren't on the wash list (change that in the van's Details → Edit).
- **Log a past wash** records a wash on an earlier date.

## Fuel

The fuel card is billed once a month by Metro Petroleum (WEX Motorpass). The statement comes with two files: a PDF and a **MPDATA….TXT** file.

### Importing the monthly statement
1. Fuel tab → **Import statement**.
2. Choose the **MPDATA….TXT** file (not the PDF).
3. Check the preview. Each fuel card is matched to its van, the total should match the statement, odd odometer readings are marked, and anything already imported is skipped.
4. Click **Import**.

Fill-ups, card fees and AdBlue are all imported, so each van's total matches the statement to the cent. Litres, $/L and L/100km count diesel only.

### Reading the Fuel tab
- It opens on the **latest statement**. Use **‹ ›** for earlier statements, or **All time**.
- One row per van: fill-ups, litres, average $/L, L/100km, **Fuel | Card fees | Total (as on statement)**. Click a van to see its fill-ups.
- **Filters ▾** has van, dates, search, and "Every line" for the full list.
- **Log fill-up** adds one by hand (rarely needed).

## Reports

- **Spending:** maintenance spend by month, by van and by type of work.
- **Fuel:** fuel use by van (vans using 15% more than the fleet average are highlighted), fuel checks worth asking about (two fill-ups in a day, premium diesel, odometer typos), monthly fuel card spend, and month-by-month trends with price per litre and the cheapest stations.
- **Budget:** set a monthly budget for fuel and for maintenance, and see each month against it.
- **Download (Excel / CSV):** everything as a spreadsheet.

The **Vehicle / Date from / Date to** filters at the top change every figure on the page.

## Tolls

Each month, when the **E-Toll Statement / Tax Invoice** PDF arrives by email:

1. Open the **Tolls** tab and click **Import statement**.
2. Choose the PDF. You'll see the period, the number of trips and a total for each van.
3. Click **Import**. Importing the same statement twice doesn't double anything; it just replaces it.

The page then shows, for that statement:
- **Tolls for the vans**, the number of **trips**, and **fees for tags not read**.
- **Worth checking:** for example a van whose trips were charged by number plate instead of its tag. That costs a video matching fee on every trip, and usually means the tag is missing, flat or not beeping.
- **By van:** click a van to see every trip (date, time, toll road, amount), and **By toll road:** where the money goes. In a van's trip list, flagged trips have the whole row coloured: **red** for a weekend trip or a possible double charge, **yellow** for after 12 pm or a tag that wasn't read.
- **Double charges:** the same van charged at the same toll point again within 15 minutes. Check it against the PDF, then dispute it with E-Toll (13 18 65) within 90 days.
- **Odd times:** trips at or after **12 pm**, or on a **Saturday or Sunday**. Click a van to see which.
- **Regular runs:** for each van, what a usual day costs, the run it repeats, the toll points it uses most, its dearest days and its one-off trips.
- **Day by day:** a bar for each day of the statement; **Heavy days**, where a van's tolls were at least 1.5 times its usual day (and $10 or more above it); and **Each van, each day**, a grid of every van's tolls for every day with heavy days in red. Click a square to see that van's trips that day, or a date to see every van that day.
- **Month to month:** each van against the statement before (from the second statement on).

Tolls also count in Home's **Spent this month**, and **Reports → Spending** has **Full running cost by van**: maintenance + fuel card + tolls.

Only the fleet vans are shown. Other vehicles on the toll account are left out, and a small note says how much of the statement's total they were. Use the **Statement** box to look at an earlier month, and **Open the PDF** to see the original.

## Google Sheet

The **Google Sheet** button opens a copy of all the data that updates by itself after every change. It's for viewing only: changes made in the sheet are overwritten.

## If the app won't open

1. **Wait 5 minutes and try again.** The app checks itself every 5 minutes and restarts if it has stopped.
2. Check you're using the right address (see "Opening the app") and that Tailscale is on.
3. Make sure the orders PC is on and plugged in.
4. Still not working? Restart the orders PC and log in. The app starts by itself.

For the app to come back after a restart **without anyone logging in**, the "Fleet Maintenance keep-alive" task in Task Scheduler on the orders PC must be set to **"Run whether user is logged on or not"** (needs the Windows password once; redo it if the password changes).
