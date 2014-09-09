/* MODULES */

var events, tools, api;
var API_KEY = "5db1fee4b5703808c48078a76768b155b421b210c0761cd6a5d223f4d99f1eaa";
var API_BASE_URL = "https://localhost:8000";
var debug = true;

// API module, has a private doRequest method, and public get and set methods
api = (function () {

    /*
    TABLE OF CONTENTS
    =================

    Private:
    -----------------
    - doRequest

    Public:
    -----------------
    - get_events
    - get_user_by_username
    - get_user_by_rfid
    - set_attended
    - patch_user
    - update_event

    */

    // Does a request based in input parameters
    var doRequest = function (type, dataType, url, params, send_data, callback) {
        $.ajax({
            type: type,
            dataType: dataType,
            contentType: "application/json",
            data: send_data,
            url: API_BASE_URL + url + params,
            success: function (return_data) {
                if (debug) console.log(return_data);
                callback(return_data);
            },
            error: function (xhr, ajaxOptions, thrownError) {
                if (xhr.status === 202 || xhr.status === 204 || xhr.status === 304) {
                    callback(xhr);
                }
                else {
                    callback(null);
                }
            }
        });
    }

    return {
        // Gets event list
        get_events: function () {
            return doRequest("GET", "json", "/api/rfid/events/", "?api_key=" + API_KEY + "&event_end__gte=" + tools.today() + "&order_by=event_start&limit=4", {}, events.events_callback);
        },

        // Gets user object by username
        get_user_by_username: function (username) {
            return doRequest("GET", "json", "/api/rfid/user/", "?username=" + username + "&api_key=" + API_KEY, {}, tools.user_callback);
        },

        // Gets user object by rfid
        get_user_by_rfid: function (rfid) {
            return doRequest("GET", "json", "/api/rfid/user/", "?rfid=" + rfid + "&api_key=" + API_KEY, {}, tools.user_callback);
        },

        // Sets an attendee as attended
        set_attended: function (attendee) {
            return doRequest("PATCH", "json", attendee.resource_uri, "?api_key=" + API_KEY, "{\"attended\": true}", events.attend_callback);
        },

        // Updates the RFID field on a user
        patch_user: function (user, rfid) {
            return doRequest("PATCH", "json", user.resource_uri, "?api_key=" + API_KEY, '{"rfid": "' + rfid + '"}', tools.patch_user_callback);
        },

        // Updates an event with new info
        update_event: function (event) {
            return doRequest("GET", "json", event.resource_uri, "?api_key=" + API_KEY, {}, events.update_event_callback);
        }
    }
}());

// The events module contains functions and containers for events, active event, active attendees and active user
events = (function () {
    
    /*
    TABLE OF CONTENTS
    =================

    Private:
    -----------------
    - extract_events

    Public:
    -----------------
    - get_event_list
    - events_callback
    - get_active_event
    - set_active_event
    - update_active_event
    - update_event_callback
    - register_attendant
    - attend_callback
    - get_active_user
    - set_active_user
    - is_attendee
    - is_already_registered

    */

    var event_list = [];
    var active_event = null;
    var update_event_index = -1;

    // Private method that parses the returned events object and checks if there are any
    var extract_events = function (data) {
        if (debug) console.log("Returned events list: " + data);
        if (data.meta.total_count > 0) {
            event_list = data.events;
            
            // Remove events that are not attendance events
            for (var x = 0; x < event_list.length; x++) {
                if (event_list[x].attendance_event == null) {
                    event_list.splice(x, 1);
                    x--;
                }
            }

            if (event_list.length > 0) {
                tools.populate_nav(event_list);
                events.set_active_event(0);
                tools.showsuccess(200, "Systemet er klart til bruk!");
            }
            else {
                tools.showerror(404, "Det er ingen pågående eller fremtidige arrangement.");   
            }
        }
        else {
            if (debug) console.log("No events returned from query...");
            tools.showerror(404, "Det er ingen pågående eller fremtidige arrangement.");
            event_list = [];
            $('#input').hide();
            $('#event_image').hide();
            $('#submit').hide();
        }
    }

    return {
        // Gets the event list from the API
        get_event_list: function () {
            if (debug) console.log("Fetching event list...");
            api.get_events();
        },
        
        // Public callback for event list
        events_callback: function (data) {
            if (data != null) {
                extract_events(data);
            }
            else {
                tools.showerror(404, "Det oppstod en uventet feil under henting av arrangementene.");
            }
        },

        // Returns the active event in view
        get_active_event: function () {
            return active_event;
        },

        // Sets the active event in view
        set_active_event: function (index) {
            active_event = event_list[index];
            $('#title').text(active_event.title);
            if (active_event.company_event.length > 0) {
                $('#event_image').attr('src', active_event.company_event[0].companies.image_companies_thumb);
            }
            else $('#event_image').attr('src', 'img/online_logo.png');
            tools.populate_attendance_list(active_event.attendance_event.users);
            $('#input').val('').focus();
            if (tools.is_there_active_rfid()) {
                tools.showsuccess(200, "Systemet er klart til bruk!");
            }
            tools.reset_last_rfid();
            if (debug) console.log("Set active event: " + index);
        },

        // Updates the active event with new data from the API
        update_active_event: function () {
            if (debug) console.log("Updating event...");
            update_event_index = event_list.indexOf(events.get_active_event());
            if (debug) console.log("Active event index: " + update_event_index);
            api.update_event(events.get_active_event());
        },

        // Public callback for the update event method
        update_event_callback: function (event) {
            if (event != null) {
                if (debug) console.log(event);
                if (debug) console.log(update_event_index);
                if (update_event_index >= 0) {
                    event_list[update_event_index] = event;
                    events.set_active_event(update_event_index);
                }
            }
            else {
                tools.showerror(400, "Det oppstod en feil under oppdatering av arrangementsinformasjonen.");
            }
            update_event_index = -1;
        },

        // Registers an attendant by the attendee URI
        register_attendant: function (attendee) {
            if (debug) console.log(events.get_active_user());
            api.set_attended(attendee);
            if (debug) console.log("Api trigger set_attended");
            if (debug) console.log(attendee);
        },

        // Public callback for the register_attendant method
        attend_callback: function () {
            if (events.get_active_user() != null) {
                tools.showsuccess(200, events.get_active_user().first_name + " " + events.get_active_user().last_name + " er registrert som deltaker. Velkommen!");
                events.set_active_user(null);
                events.update_active_event();
            }
            else {
                tools.showerror(400, "Det oppstod en uventet feil under registering av deltakeren.");
            }
        },

        // Gets the active user being processed
        get_active_user: function () {
            return active_user;
        },

        // Sets the active user being processed
        set_active_user: function (user) {
            active_user = user;
        },

        // Checks if user is in attendee list, returns an attendee object if true, false otherwise
        is_attendee: function (user) {
            if (debug) console.log("Checking if attendee:");
            if (debug) console.log(user);
            for (var x = 0; x < active_event.attendance_event.users.length; x++) {
                if (active_event.attendance_event.users[x].user.username == user.username) return active_event.attendance_event.users[x];
            }
            return false;
        },

        // Checks if attendee is already set as attended to an event
        is_already_signed_up: function (attendee) {
            if (attendee.attended) {
                return true;
            }
            return false;
        },

        is_waitlisted: function (attendee) {
            var i = active_event.attendance_event.users.indexOf(attendee);
            if (i != -1) {
                if (i > active_event.attendance_event.max_capacity - 1) {
                    return true;
                }
            }
            return false;
        }
    }
}());

// The tools module contains different methods for manipulating the DOM and other fancy stuff
tools = (function () {

    /*
    TABLE OF CONTENTS
    =================

    Private:
    -----------------
    - parse_code

    Public:
    -----------------
    - showerror
    - showsuccess
    - tempshow
    - today
    - populate_nav
    - populate_attendance_list
    - get_user_by_rfid
    - get_user_by_username
    - reset_last_rfid
    - is_there_active_rfid
    - user_callback
    - patch_user_callback
    - parse_input

    */

    var last_rfid = null;

    return {
        // Show an error message on the top of the page...
        showerror: function (status, message) {
            $('#topmessage').removeClass().addClass("alert alert-danger").html(message + '<div class="pull-right">' + tools.now() + '</div>');
        },

        // Show a warning message on the top of the page...
        showwarning: function (status, message) {
            $('#topmessage').removeClass().addClass("alert alert-warning").html(message + '<div class="pull-right">' + tools.now() + '</div>');
        },

        // Show a success message on the top of the page...
        showsuccess: function (status, message) {
            $('#topmessage').removeClass().addClass("alert alert-success").html(message + '<div class="pull-right">' + tools.now() + '</div>');
        },

        // Temporarily show a DOM object
        tempshow: function (object) {
            object.fadeIn(200);
            setTimeout(function () {
                object.fadeOut(200);
            }, 3000);
        },

        // Returns a date string representing today for filtering purposes
        today: function () {
            var d = new Date();
            y = d.getFullYear();
            m = d.getMonth() + 1;
            d = d.getDate();
            if (m < 10) m = "0" + m;
            if (d < 10) d = "0" + d;
            return y + "-" + m + "-" + d;
        },

        // Returns a time string representing present time
        now: function () {
            var d = new Date();
            h = d.getHours();
            m = d.getMinutes();
            s = d.getSeconds();
            if (h < 10) h = "0" + h;
            if (m < 10) m = "0" + m;
            if (s < 10) s = "0" + s;
            return h + ":" + m + ":" + s;
        },

        // This method populates the navbar dropdown with the events in the specified event_list
        populate_nav: function (event_list) {
            $(event_list).each(function (id) {
                $('#nav').append($('<li><a href="#" id="' + id + '">' + event_list[id].title + '</a></li>'));
                if (id == 0) {
                    $('#nav li a').click();
                }    
            });
        },

        // This method takes in an array of attendees and lists those whose attended flag is set to true,
        // as well as keeping track of the total amount of attendees.
        populate_attendance_list: function (attendees) {
            var ev = events.get_active_event();
            var list = $('#attendees');
            var registered = [];
            var unregistered = [];
            var waitlisted = [];
            var tabledata = '';

            // Sorting function for attendee array by firstname
            var sort_by_name = function(a, b) {
                var first = a.first_name.toLowerCase();
                var second = b.first_name.toLowerCase();
                if (first < second) return -1;
                else if (first > second) return 1;
                else return 0;
            };

            // Seperate the boys from the men (split into registered, unregistered and waitlisted)
            for (var x = 0; x < attendees.length; x++) {
                if (attendees[x].attended) {
                    registered.push(attendees[x].user);
                }
                else if (ev.attendance_event.waitlist && (x+1) > ev.attendance_event.max_capacity) {
                    waitlisted.push(attendees[x].user);
                }
                else {
                    unregistered.push(attendees[x].user);
                }
            };

            // Sort the lists alfabetically
            registered.sort(sort_by_name);
            unregistered.sort(sort_by_name);

            // Build the list
            tabledata += '<tr><th>Møtt</th></tr>';
            $(registered).each(function (i) {
                tabledata += '<tr><td>' + registered[i].first_name + ' ' + registered[i].last_name + '</td></tr>';
            });
            tabledata += '<tr><th>Ikke møtt</th></tr>';
            $(unregistered).each(function (i) {
                tabledata += '<tr><td>' + unregistered[i].first_name + ' ' + unregistered[i].last_name + '</td></tr>';
            });
            tabledata += '<tr><th>Venteliste</th></tr>';
            $(waitlisted).each(function (i) {
                tabledata += '<tr><td>' + (i + 1) + '. ' + waitlisted[i].first_name + ' ' + waitlisted[i].last_name + '</td></tr>';
            });
            list.html(tabledata);

            // Update stats
            $('#total_attendees').html('Møtt: ' + registered.length + ' &ndash; Påmeldte: ' + attendees.length+ ' &ndash; Plasser: ' + ev.attendance_event.max_capacity);
        },

        // Get user by RFID
        get_user_by_rfid: function (rfid) {
            if (debug) console.log("Getting user by rfid: " + rfid);
            last_rfid = rfid;
            api.get_user_by_rfid(rfid);
        },

        // Get user by Username
        get_user_by_username: function (username) {
            if (debug) console.log("Getting user by username: " + username);
            api.get_user_by_username(username);
        },

        reset_last_rfid: function () {
            last_rfid = null;
        },

        is_there_active_rfid: function () {
            if (last_rfid != null) {
                return true;
            }
            else {
                return false;
            }
        },

        // Public callback for User queries
        user_callback: function (user) {
            if (user != null && user.meta.total_count == 1) {

                // Set the active user
                events.set_active_user(user.objects[0]);
                if (debug) console.log("User object returned");
                if (debug) console.log(user.objects[0]);

                // Check wether active user is a registered attendee for active event
                var e = events.is_attendee(events.get_active_user());
                if (e) {
                    console.log("Attendee is in list and attendee object returned");
                    if (!events.is_already_signed_up(e)) {
                        
                        // Checks if user is waitlisted
                        if (events.is_waitlisted(e)) {
                            if (confirm(e.user.first_name + ' ' + e.user.last_name + ' er på venteliste. Registrere allikevel?')) {
                                events.register_attendant(e);
                            }
                            else {
                                last_rfid = null;
                                tools.showerror(401, "Brukeren ble ikke registrert!");
                            }
                            $('#input').focus();
                        }
                        else {
                            events.register_attendant(e);
                        }

                        // Update the user object with the RFID number if an active RFID is in processing
                        if (last_rfid != null) {
                            api.patch_user(events.get_active_user(), last_rfid);
                        }
                    }
                    else {
                        tools.showerror(400, "Brukeren er allerede registrert!");
                        last_rfid = null;
                    }
                }
                else {
                    tools.showwarning(401, "Brukeren er ikke påmeldt arrangementet. Han/hun må legges til manuelt i administrasjonspanelet.");
                }
            }
            else {
                var msg = "";
                if (last_rfid != null) {
                    msg += "Kortet finnes ikke i databasen. Skriv inn et brukernavn for å knytte kortet til brukeren og sjekk inn.";
                    tools.showwarning(404, msg);
                }
                else {
                    msg += "Brukeren finnes ikke i databasen.";
                    tools.showerror(404, msg);
                }
                events.set_active_user(null);
            }
        },

        // If patching of the user object was a success, reset the last_rfid field to null
        patch_user_callback: function (xhr) {
            if (xhr.status < 400) {
                last_rfid = null;
            }
        },

        // Parse text input for RFID or username
        parse_input: function (input) {
            if (debug) console.log("Parsing input...");
            if (/^[0-9]{8,20}$/.test(input)) {
                if (debug) console.log("Rfid valid");
                tools.get_user_by_rfid(input);
            }
            else {
                if (debug) console.log("Not RFID");
                tools.get_user_by_username(input);
            }
            $('#input').val('').focus();
        },
    }
}());

// On page load complete, do this stuff...
$(document).ready(function () {

    // Active nav pane indicator variable
    var previous_event = null;

    // Get the event list from the API
    events.get_event_list();

    // Initiate the top message box!
    $('#topmessage').removeClass().addClass("alert alert-warning").html('Laster arrangementsinformasjon...<div class="pull-right">' + tools.now() + '</div>').fadeIn(200);

    // Bind click listeners to the events menu links
    $('#nav').on('click', 'a', function (event) {
        event.preventDefault();
        if (previous_event != null) previous_event.removeClass();
        events.set_active_event($(this).attr("id"));
        previous_event = $(this).parent();
        previous_event.addClass('active');
    });

    // Enter key binding in the input field
    $('#input').keypress(function (key) {
        if (key.which === 13) {
            var input = $('#input').val();
            tools.parse_input(input);
            tools.showwarning(200, "Sender forespørsel...");
        }
    });

    $('#toggle_options').on('click', function (e) {
        $('#options').fadeToggle(200);
        $('#input').focus();
    });

});
