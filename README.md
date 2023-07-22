# ih8rtcgui tool

Simple GUI tool for managing/keeping track of RTC items in a simplistic manner

Disclaimer: This project is not intended as a full replacement of the original RTC (EWM) web interface, it is more of a way to quickly edit status/owner/add comment to a workitem or check something without having to log in every few hours. (This requires "Save details for automatic re-login?" to be checked on login page)  

![img.png](img.png)
![img_1.png](img_1.png)
![img_2.png](img_2.png)

## Features
1. Query workitems by modified/created date (before, after, between) and further filter in table (be careful, before can be slow depending on your project area)
2. Full-text search in table, dropdowns on columns where it makes sense
3. Modify state and owner of workitem (right click)
4. Add comment with basic formatting (bold, link)
5. Automatic refresh (1 minute, 5 minutes etc) (it doesn't refresh if there is a workitem opened!)
6. See details of workitem a little quicker than it would in RTC website
7. Auto updater

## Installation
1. Download installer from `[Releases](https://github.com/kenny59/ih8rtcgui/releases)`
2. Install it (have a coffee/tea/energy drink in the meantime, it may take a few minutes to install), it will automatically open the app after install
3. Click on "Open configs" and fill details (this is mandatory). Click save afterwards
4. Login using your credentials (select save credentials if you don't want to enter it every time)
5. Have fun:)