<?php
/**
 * START PARSING GROUP
 * Finds out all the keys and validator items that are needed from a survey json's questions object
 * IGNORES subquestions that haven't had their parent option selected
 */
/**
 * ASSUMPTION: The array passed in has already been parsed by add_responses_and_keys() in order to get all the
 *              necessary meta data added.
 * The result of this function is a simple array where the keys are ids of questions, and the values are the
 * validation rules that apply to that question. If a question is detected as not visible (it is a subquestion
 * whose required option is not selected) then that key will be entirely omitted in the output.
 * @param $qs {json} a complete json, with question ids, and responses added by add_responses_and_keys()
 * @return array The array of ids to validation rules
 */
public function parse_questions_for_keys($qs)
{
    $len = count($qs);
    // This parsing should mimic the parsing done in survey parser so that the 2 can match up to check for errors
    $keys = [];
    for($i = 0; $i < $len; $i++)
    {
        if (gettype($qs[$i]) == 'array'){
            $this->parse_question($qs[$i], $keys);
        } elseif(gettype($qs[$i]) == 'string'){
            // Expected, just ignore
        } else {
            error_log("Unhandled question type in parse_questions_for_keys: ". gettype($qs[$i]));
        }
    }
    return $keys;
}

/**
 * Handles individual questions for parse_questions_for_keys()
 * @param $question {json} the question object
 * @param $keys {array reference} to the keys array so that it can add keys without needing to make copy
 */
public function parse_question($question, &$keys)
{
    // Get the idx of this question
//        error_log_array($question);
    $idx = $question["key"];

    // Add the key to list of keys, it's value should be its validation rule
    if(isset($question['validation']))
    {
        $val_rules = $question['validation'];
    } else {
        $val_rules = NULL;
    }

    // Validation MUST be an array of options, otherwise we consider the field required
    if(gettype($val_rules) == "array"){
        $keys[$idx] = [];
        foreach($val_rules as $i => $rule){
            $keys[$idx] += [$rule]; // Add all the rules to the key index of validation rules
        }
    } else {
        $keys[$idx] = ["req"];
    }

    // Check for possible sub-question keys
    if($question["input_mode"] == 'options' or $question["input_mode"] == 'select')
    {
        $opt_len = count($question['options']);
        for($i = 0; $i < $opt_len; $i++)
        {
            $this->parse_option($question['options'][$i], $question['response'], $keys);
        }
    }

}

/**
 * Handles individual options for parse_question()
 * @param $option {json} the options object to parse
 * @param $response {string} the response to the option's parent question
 * @param $keys {array reference} to the keys array to pass to sub question parser
 */
public function parse_option($option, $response, &$keys)
{
    // Only parse options that have subquestions and the response matches
    if(is_array($option) and ($response == $option['option_text'])){
        $sub_q_len = count($option['sub_questions']);
        for($i = 0; $i<$sub_q_len; $i++)
        {

            if (gettype($option['sub_questions'][$i]) == 'array'){
                $this->parse_question($option['sub_questions'][$i], $keys);
            } elseif(gettype($option['sub_questions'][$i]) == 'string'){
                // Expected, just ignore
            } else {
                error_log("Unhandled question type in parse_questions_for_keys: ". gettype($option['sub_questions'][$i]));
            }
        }

    }
}
//////////////////////
// END PARSING GROUP
//////////////////////

/**
 * START RESPONSES AND KEYS GROUP
 * Adds a key (like "Q34-0-0") to each question, along with the response if any from the given input (like "Yes" or "No")
 * @param $questions
 * @param $responses
 * @return mixed
 */
/**
 * Parses a survey json, and a simple array of responses to append all responses into the json as keys for much
 * simpler parsing later on by the validation parser parse_questions_for_keys().
 * @param $questions {json} the survey json
 * @param $responses {array} of type "q_id" => "q_response", does not need to include keys for unanswered questions
 * @return mixed {json} the improved json
 */
public function add_responses_and_keys(&$questions, $responses)
{
    $len = count($questions);
    // This parsing should mimic the parsing done in survey parser so that the 2 can match up to check for errors
    $id = 0;
    for($i = 0; $i < $len; $i++)
    {
        if(gettype($questions[$i]) == 'array'){
            $this->arak_question($questions[$i], "Q".$id, $responses);
            $id++;
        } elseif(gettype($questions[$i]) == 'string'){
            // Expected, just ignore
        } else {
            error_log("Unhandled question type in add_responses_and_keys: ". gettype($questions[$i]));
        }
    }
    return $questions;
}
/**
 * Parses an individual question for add_responses_and_keys()
 * @param $question {json} the question object to parse
 * @param $idx {string} the id this question would have if parsed by the survey_parser.js
 * @param $responses {array} the set of responses to questions
 */
public function arak_question(&$question, $idx, $responses)
{
    // Add the key to the question
    $question['key'] = $idx;
    // Add response to the question
    $question['response'] = isset($responses[$idx]) ? $responses[$idx] : "";

    // Check for possible sub-question keys
    if($question["input_mode"] == 'options' or $question["input_mode"] == 'select')
    {
        $opt_len = count($question['options']);
        for($i = 0; $i < $opt_len; $i++)
        {
            $this->arak_option($question['options'][$i], $idx, $i,$responses);
        }
    }
}
/**
 * Parses an individual option for add_responses_and_keys(),
 * because options can have subquestions it takes the set of responses for passing along to recursive calls
 * @param $option {json} the options object to parse
 * @param $q_idx {string} the id of the parent question
 * @param $o_idx {string} the id of this option, same as if it was parsed by the survey_parser.js
 * @param $responses {array} the set of question responses
 */
public function arak_option(&$option, $q_idx, $o_idx, $responses)
{
    if(is_array($option)){
        $sub_q_len = count($option['sub_questions']);
        $id = 0;
        for($i = 0; $i<$sub_q_len; $i++)
        {

            if(gettype($option['sub_questions'][$i]) == 'array'){
                $this->arak_question($option['sub_questions'][$i], $q_idx."--".$o_idx."--".$id,$responses);
                $id++;
            } elseif(gettype($option['sub_questions'][$i]) == 'string'){
                // Expected, just ignore
            } else {
                error_log("Unhandled question type in arak_option: ". gettype($option['sub_questions'][$i]));
            }
        }

    }
}
//////////////////////
// END RESPONSES AND KEYS GROUP
//////////////////////

/**
 * Handles submitting a survey, performs validation first. If validation fails it will send a list of failure
 * codes back, otherwise it submits and sets the users submit status to TRUE for this survey
 * @see $_POST['survey'] {json} The responses to the survey, as generated by a form's submit button,
 *              needs to contain as the first two keys the "survey_id" and "survey_type_id" @todo @austin refactor this requirement out
 */
public function submit_survey()
{
    $form_input = $_POST['survey'];
    $survey_id = $form_input[0]['value']; //@todo @austin magic value, need to implement a search for this key to prevent this breaking in the future or pass it directly in the javascript
    $questions_json = json_decode($this->Take_survey_model->get_model_survey_json($survey_id), TRUE)['questions'];


    $responses = [];
    foreach(array_slice($form_input, 2) as $input)
    {
        if(!isset($responses[$input['name']])){
            $responses[$input['name']] = $input['value'];
        } else if(substr($responses[$input['name']], 0, 2) !== '{}'){
            // Place a '{}' to denote a multi value column, append second value
            $responses[$input['name']] = "{}" . $responses[$input['name']] . "{}" . $input['value'] . "{}";
        } else {
            // append another value to multi value column
            $responses[$input['name']] .= $input['value'] . "{}";
        }
    }
//        error_log_array($responses);
    $master_json = $this->add_responses_and_keys($questions_json, $responses);
    $survey_keys = $this->parse_questions_for_keys($master_json);
//        error_log_array($master_json);
//        error_log_array($survey_keys);


    // Fix for bug ES-47 "Answering subquestions, then unanswering will still allow subquestion responses to be recorded"
    // Cycle through the keys and only keep those responses that have a key (parse question for keys doesn't keep hidden subquestion keys)
    $validated_responses = [];

    $return_msg = [];
    // We now have a list of all the inputs from the form, and a list of all the keys possible with their validation rules
    // We compare each key possible with the value given in the form and check the validation rules. If there is
    // Any issue we inform the user with a message, if there is no issue we pass the form input along to be submitted
    foreach ($survey_keys as $key => $rules)
    {
        // Get the value from the form if available
        $value = isset($responses[$key]) ? $responses[$key] : NULL;
        // Store it in the validated responses (filters out invalid subquestions)
        if(isset($responses[$key])){
            $validated_responses[$key] = $responses[$key];
        }

        foreach ($rules as $idx => $rule){
            if($rule == "req"){
                if ($value == NULL or $value == ""){
                    $return_msg[$key] = "Requires an input";
                }
            } elseif ($rule == "opt"){
                // Do nothing, this field is optional
            } else {
                error_log("Unhandled rule");
            }
        }
    }
    // Now only operate on the validated responses
    $responses = $validated_responses;

    if ($return_msg == []){
        // Everything is good
        $this->Take_survey_model
            ->submit_survey($survey_id, $responses, True);
        $this->notify_submission($survey_id, $responses);
        send(array("success" => "Survey submitted"));
    } else {
//            $err_string = "";
//            foreach ($return_msg as $field => $issue){
//                $err_string .= $field . ": " . $issue . "<br/>";
//            }
//            error_log($err_string);
        send(array("error" => "Please fill out the fields marked with a star", "data" => $return_msg));
    }

}