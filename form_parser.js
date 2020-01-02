/**
 * OPTIONS
 */
// var unselected_value = ""; // The default value to use for the hidden inputs used to detect if input hasn't been selected

/**
 * Renders a survey that is formed as a JSON file to a string, which is returned and can be appended to the DOM.
 * Requires JQuery for allowing dynamic rendering of subquestions
 *
 *********************
 * JSON FORMAT
 *********************
 * Any key preceeded with an @O is entirely optional
 *
 * survey_json : {
 *  "name" : {string} The name of the survey, used for a header. Can be blank.
 *  "questions" : {array} an array of {string} or {questions objects}, question objects will be parsed, strings will be displayed as is (useful for section headers, info boxes, etc. Because it's output as is it will also accept valid HTML markup)
 *  "styles" : {string} Optional, if set, will be placed as is between <style> tags at the end of the survey. Useful for survey specific styling. Please note the CSS format below.
 * }
 *
 * questions objects : {
 *  "question" : {string} The text to display for the question
 *  "input_mode" : One of
 *                      "options" the user will be given a set of radios/checkboxes to choose from, requires "options"; "allowed_choices"
 *                      "input" the user will be prompted to input a string
 *                      "input-date" the user will be prompted to input a date using the default date picker for their browser
 *                      "input-company" the user will be prompted to input a company name, an auto-complete api will be employed to help answers conform. Requires that the function enable_autocompletes() is run once the survey has been attached to the DOM
 *                      "input-course" the user will be prompted to input a course name, an auto-complete api will be employed to help answers conform. Requires that the function enable_autocompletes() is run once the survey has been attached to the DOM
 *                      "input_long" the user will be prompted to input a string using a larger textarea suitable for long input.
 *                      "select" the user will be prompted to select from a dropdown/multiselect. requires "options"; "allowed_choices"
 *      "options" : {array} an array of strings (the simple option text to be provided), or {options objects}
 *      "allowed_choices" : {int} number of options that can simultaneously be selected, 1 produces radio buttons/dropdown, anything else produces checkboxes/multiselect (@todo @austin limiting the number of checkboxes is not supported)
 *  @O "validation" : {array of strings} This array is optional, the default validation for a question is simply that any sort of input is required. The following strings can be used in an array to give finer validation:
 *                      "req" the field is required
 *                      "opt" the field is optional
 *                      // @todo @austin add more validation options
 *  "classes" : {string} optional, if set, will be added alongside the .section-{question_id} class in the class attribute for the section. Useful for per question styling. See the CSS format below.
 * }
 *
 * options object : {
 *  "option_text" : {string} the text to display for this option
 *  "sub_questions" : {array} an array of {questions objects} that will be presented if and only if this option is selected
 * }
 *
 *********************
 * END JSON FORMAT
 *********************
 *
 *********************
 * CSS FORMAT
 *********************
 * <div class='survey {survey_id}'>
 *     <div class='section-{question_id}'> <!--Repeat for each question in the JSON-->
 *        <div class='question'>Question text here</div>
 *        <div class='options'> <!--Repeat for each input option in the question (just 1 for input boxes-->
 *            Option items here, input and labels
 *        </div>
 *        <div class='sub-questions'> <!--One for each option, regardless if empty or full-->
 *            <div class='{question_id}' id='{option_id}'>
 *                Questions nested downward
 *            </div>
 *        </div>
 *    </div>
 * </div>
 *********************
 * END CSS FORMAT
 *********************
 *
 *
 * @todo @austin is there any way to extract the CSS from this so that we can easily change survey styles?
 *
 * @param survey_json {json} A survey that is a properly formatted JSON according to the above spec
 * @param survey_id {int} A unique identifier that will link all responses to the same survey across users in the database
 * @param type_id {int} A survey type id that must be one defined in the survey_types table
 * @param old_responses {json} a json containing old responses, in the format of {"q_id1" : "q_id1 response value", "q_id2" : "q_id2 response value" ... }
 *                              This will preselect options that match the question id's and options of the survey
 * @returns {string} A valid HTML string with included JS calls for dynamic content
 */
function render_survey(survey_json, survey_id, type_id, old_responses){
    // Convert the questions into html + js for rendering
    let outs = "";
    outs += `<h2>${survey_json.name}</h2>`;




    outs += "<input name='survey_id' hidden value='" + survey_id + "'/>";
    outs += "<input name='survey_type_id' hidden value='" + type_id + "'/>";

    outs += `<div class='survey id-${survey_id}'>`;
    let surv_len = survey_json.questions.length;
    let id = 0; // Questions may not all need ids, so we track id's separately from the loop
    let q_render;
    for (let i = 0; i < surv_len; i++){
        q_render = render_question(survey_json.questions[i], 'Q' + id, old_responses);
        if (q_render === -1){
            // The question was a simple string, append to the output as is without an id
            outs += survey_json.questions[i];
        } else {
            outs += q_render;
            id++;
        }
    }
    outs += "</div>";

    if(survey_json.styles){
        outs += `<style>${survey_json.styles}</style>`;
    }

    return outs;
}
/**
 * Render a question, requires a unique index idx for selecting questions for the purpose of javascript UI elements,
 * returns the rendered question as a string.
 * If the passed in question is a simple string, it will instead return -1 -> this allows for better handling
 * of question id's by the caller, for example, allowing it to choose to not assign question id's to simple strings.
 * @param q the question object, from JSON
 * @param idx the unique index given to this question
 * @param old_responses see render_survey param old_responses
 */
function render_question(q, idx, old_responses){
    if (typeof q === 'string'){
        // This is a simple string, output as is, signal the caller this by passing back -1
        return -1;
    }

    // Otherwise we have to parse a question object
    let outs = "";
    outs += `<div class="section-${idx} ${q.classes ? q.classes : ''}">`; // Add the questions classes from the JSON if they have been set
    outs += `<div class='question'><span id='${idx}' class='err-warning hidden'>*</span>${q.question}</div>`;
    outs += `<div class='content'>`;
    outs += `<span id='${idx}' class='err-warning-text hidden'></span>`;
    outs += `<div class='options'>`;

    let old_value = "";
    if(typeof old_responses[idx] !== 'undefined'){
        old_value = old_responses[idx];
    }

    let sub_q_outs = [];
    if (q.input_mode === "input"){
        outs += `<input value='${old_value}' name='${idx}'/>`;
    } else if (q.input_mode === "input-date"){
        outs += `<input value='${old_value}' name='${idx}' type='date'/>`;
    } else if (q.input_mode === "input-company"){
        outs += `<input class='input-autocomplete-company' value='${old_value}' name='${idx}'/>`;
    } else if (q.input_mode === "input-course"){
        outs += `<input class='input-autocomplete-course' value='${old_value}' name='${idx}'/>`;
    } else if (q.input_mode === "input_long"){
        outs += `<textarea class="adaptable" name='${idx}'>${old_value}</textarea>`; // The adaptable class makes the text area fill horizontally, and be user re-sizable vertically.
    } else if (q.input_mode === "options"){
        let opt_len = q.options.length;
        for (let i = 0; i < opt_len; i++){
            // An option can return both it's own output, plus a subquestion set of output
            // that needs to be rendered as hidden until this specific option is selected.
            let opt_id = idx + '--' + i;
            let opt_outs =  render_option(q.options[i], q.allowed_choices, idx, opt_id, old_responses);
            outs += opt_outs[0];
            sub_q_outs.push([opt_id, opt_outs[1]]);
        }
    } else if (q.input_mode === "select"){
        let opt_len = q.options.length;
        let multiple = (q.allowed_choices > 1) ? " multiple " : "";

        // Find and preselect the old_response value from the user
        // @todo @austin this lengthy check is just to prevent us from selecting the default option if user has selected another option before, more efficient method?
        let selected = "";
        for (let i = 0; i < opt_len; i++){
            if (typeof q.options[i] === 'object'){
                selected = (old_responses[idx] === q.options[i].option_text) ? " value='" + q.options[i].option_text + "' " : selected;
            } else {
                selected = (old_responses[idx] === q.options[i]) ? " value='" + q.options[i] + "' " : selected;
            }
        }
        let default_opt = (selected !== "") ? "" : " selected "; // select a default option as a fallback, do not select it if a value exists

        outs += `<select name='${idx}' id='${idx}' onchange='select_click("${idx}")' ${multiple}>`;
        outs += "<option disabled" + default_opt + " value style=\"display: none;\">Choose an option</option>";
        for (let i = 0; i < opt_len; i++){
            // An option can return both it's own output, plus a subquestion set of output
            // that needs to be rendered as hidden until this specific option is selected.
            let opt_id = idx + '--' + i;
            let opt_outs =  render_select_option(q.options[i], q.allowed_choices, idx, opt_id, old_responses);
            outs += opt_outs[0];
            sub_q_outs.push([opt_id, opt_outs[1]]);
        }
        outs += "</select>"
    } else {
        console.log(`Question '${q.question}' has unknown input mode: ${q.input_mode}`);
    }

    outs += "</div>";
    outs += "<div class='sub-questions'>";

    // Render sub question divs, hidden until the parent option is selected
    for (let i = 0; i < sub_q_outs.length; i++){
        outs += `<div style='display: none;' class='${idx}' id='${sub_q_outs[i][0]}'> ${sub_q_outs[i][1]}</div>`;
    }

    outs += "</div>";
    outs += "</div>";
    outs += "</div>";
    return outs;
}

/**
 * Renders to HTML an options object for radio buttons and checkbox elements.
 * Because options objects can have sub_questions, it recursively can call render_question and handles a tiny bit
 * of javascript meant to only show a div with the sub_questions that match this option when selected
 * @param option {json} options object to render
 * @param allowed_choices {int} the number of allowed choices (determines radio or checkbox)
 * @param q_idx {string} the id of the parent question
 * @param idx {string} the id of this option
 * @param old_responses see render_survey param old_responses
 * @returns {*[]} a string of html rendered survey from the json
 */
function render_option(option, allowed_choices, q_idx, idx, old_responses){
    let outs = "";

    let sub_q_outs = "";
    // Options for answers can either be checkboxes, or radio buttons
    if(allowed_choices === 1){
        if (typeof option === 'object'){
            let selected = (old_responses[q_idx] === option.option_text) ? " checked " : ""; // select this option by default if it was selected in the old responses
            outs += `<label><input onchange='input_click("${q_idx}","${idx}")' type='radio' name='${q_idx}' value="${option.option_text}" ${selected}/>${option.option_text}</label>`;
            let sub_qs = option.sub_questions;
            let id = 0;
            let q_render;
            for (let i = 0; i < sub_qs.length; i++){
                q_render = render_question(sub_qs[i], idx + '--' + id, old_responses);
                if (q_render === -1){
                    // The question was a simple string, append to the output as is without an id
                    sub_q_outs += sub_qs[i];
                } else {
                    sub_q_outs += q_render;
                    id++;
                }
            }
        } else {
            let selected = (old_responses[q_idx] === option) ? " checked " : "";
            outs += `<label><input onchange='input_click("${q_idx}","${idx}")' type='radio' name='${q_idx}' value="${option}" ${selected}/>${option}</label>`;
        }
    } else if (allowed_choices > 1) {
        let all_responses = (old_responses[q_idx] !== undefined) ? old_responses[q_idx].split("{}") : [];
        if (typeof option === 'object'){
            let selected = (all_responses.includes(option.option_text)) ? " checked " : ""; // select this option by default if it was selected in the old responses
            outs += `<label><input onchange='input_click_checkbox("${idx}")' input_idx="${idx}" type='checkbox' name='${q_idx}' value="${option.option_text}" ${selected}/>${option.option_text}</label>`;
            let sub_qs = option.sub_questions;
            let id = 0;
            let q_render;
            for (let i = 0; i < sub_qs.length; i++){
                q_render = render_question(sub_qs[i], `${idx}--${id}`, old_responses);
                if (q_render === -1){
                    // The question was a simple string, append to the output as is without an id
                    sub_q_outs += sub_qs[i];
                } else {
                    sub_q_outs += q_render;
                    id++;
                }
            }
        } else {
            let selected = (all_responses.includes(option)) ? " checked " : "";
            outs += `<label><input onchange='input_click_checkbox("${idx}")' input_idx="${idx}" type='checkbox' name='${q_idx}' value="${option}" ${selected}/>${option}</label>`;
        }
    } else {
        console.log(`Question has unhandled allowed_choices value: ${allowed_choices}`);
    }

    return [outs, sub_q_outs];
}

/**
 * Renders to HTML an options object for select(dropdown) and multiselect elements.
 * Assumes that the outer <select> tag has been already handled by caller
 * @param option {json} options object to render
 * @param allowed_choices {int} the number of allowed choices (determines dropdown or multiselect)
 * @param q_idx {string} the id of the parent question
 * @param idx {string} the id of this option
 * @param old_responses see render_survey param old_responses
 * @returns {*[]} a string of html rendered survey from the json
 */
function render_select_option(option, allowed_choices, q_idx, idx, old_responses){
    let outs = "";

    let sub_q_outs = "";

    if (typeof option === 'object'){
        let selected = (old_responses[q_idx] === option.option_text) ? " selected " : ""; // select this option by default if it was selected in the old responses
        outs += `<option value="${option.option_text}" div-control='${idx}' ${selected}>${option.option_text}</option>`;
        let sub_qs = option.sub_questions;
        for (let i = 0; i < sub_qs.length; i++){
            sub_q_outs += render_question(sub_qs[i], `${idx}--${i}`, old_responses);
        }
    } else {
        let selected = (old_responses[q_idx] === option) ? " selected " : "";
        outs += `<option value="${option}" div-control='${idx}' ${selected}>${option}</option>`;
    }


    return [outs, sub_q_outs];
}

/**
 * Function to handle hiding all sub_question divs when a radio is clicked, and showing the newly
 * selected sub_question div
 * @param q_idx {string} id of the question the clicked option belongs to
 * @param option_idx {string} id of the option whose subdiv must be shown
 */
function input_click(q_idx, option_idx){
    $('.' + q_idx).hide();
    $('#' + option_idx).show();
}
/**
 * Function to handle hiding/showing sub_question divs when a checkbox is clicked
 * @param option_idx {string} id of the option whose subquestion div must be shown
 */
function input_click_checkbox(option_idx)
{
    if($(`input[input_idx="${option_idx}"]`).is(':checked')){
        $('#' + option_idx).show();
    } else {
        $('#' + option_idx).hide();
    }
}

/**
 * Function to handle hiding all sub_question divs when a select or multiselect is clicked, and showing the newly
 * selected sub_question div
 * @param q_idx {string} the id of the question containing the selected option
 */
function select_click(q_idx){
    $('.' + q_idx).hide();
    // $('#' + $('select#' + q_idx).find('option:selected').attr("div-control")).show();
    $('select#' + q_idx).find('option:selected').each(function (){
        $("#" + $(this).attr("div-control")).show()
    })
}


function enable_autocompletes () {
    company_autocomplete('.input-autocomplete-company');
    course_autocomplete('.input-autocomplete-course');
}