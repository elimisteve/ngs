" Vim syntax file
" Language:     NGS
" Maintainer:   Ilya Sher
" URL:			
" Release Coordinator:	
" ----------------------------------------------------------------------------
"
" if exists("b:current_syntax")
"   finish
" endif

setf ngs
syn match   ngsOperator "[-~!^&|*/%+=<>`]\+"
syn match   ngsComment " #.*" contains=ngsTodo
syn match   ngsComment "^\s*#.*" contains=ngsTodo
syn match   ngsComment "^[ \t]*doc .*" contains=ngsTodo
"syn match   ngsTest "^TEST .*"
syn keyword ngsKeyword A B C and break breaks catch collector collect cond continue continues econd ematch eswitch do F global guard local match ns or return returns switch TEST throw throws tor try type upvar while with X Y Z .. ...
syn keyword ngsConditional if then else
syn keyword ngsRepeat for
" bootstrap types
syn keyword ngsType NotImplemented ReadFail RequireFail MainFail
" other types
syn keyword ngsType Any ArgvMatcher ArgvMatcherDecorator Arr ArrIter ArrLike BasicType Bool CLib CollectingPipeFromChildToParentProcess Command CommandsPipe CommandsPipeline ConstIter Counter CSym DelimStr Eachable Eachable1 Eachable2 ElementNotFound EmptyEachableFail ExecutableNotFound Exit FFI Fun Hash HashIter HashLike InstantiatingAbstractType Int Iter KillFail MultiMethod NormalType NormalTypeInstance NoData Null Num Path Pipe PipeCreateFail PipeFromChildProcess PipeFromChildToParentProcess PipeFromParentToChildProcess PipeToChildProcess Pred Process ProcessFail Range RangeIter Real ReadingPipeBetweenChildren Seq Set Stats Str Table TableMeta TableMetaNotIfCol TtyCheckFail Type UserDefinedMethod WritingPipeBetweenChildren
syn keyword ngsType Box EmptyBox FullBox BoxFail
syn keyword ngsType Range NumRange PredRange
syn keyword ngsType Diff ArrDiff HashDiff
syn keyword ngsType Presence PartialPresence Present Absent ExactPresence
syn keyword ngsType AssertFail ArgsMismatch CException EmptyArrayFail Error Exception FatalError CompileFail DontKnowHowToCall GlobalNotFound MethodNotFound InternalError LookupFail KeyNotFound StackDepthFail UndefinedLocalVar
syn keyword ngsType File SocketFile Symlink BlockDevice Dir CharDevice FifoFile MaybeFile
syn keyword ngsType FileIOFail StatFail
syn keyword ngsType Hook
syn keyword ngsType IndexNotFound FieldNotFound InvalidParameter NoNext
syn keyword ngsType InvalidArgument DivisionByZero
syn keyword ngsType Lock ReentrantLock Pthread PthreadAttr Thread
syn keyword ngsType LockFail
syn keyword ngsType RegExp RegExpCompileFail
syn keyword ngsType Redir
syn keyword ngsType Result Success Failure ResultFail
syn keyword ngsType Return
syn keyword ngsType Renderer ItemsContainer ItemsVerticalContainer ItemsHorizontalContainer
syn keyword ngsType Match MatchY MatchN MatchFail SubSeq Pfx MaybePfx MustPfx Ifx MaybeIfx MustIfx Sfx MaybeSfx MustSfx
syn keyword ngsType Props
syn keyword ngsType Time TimeFail
syn keyword ngsTodo TODO FIXME XXX NOTE
syn keyword ngsConstant true false null
syn keyword ngsPredefinedVariable ARGV ARGV0 ENV ORIG_ARGV _exports VERSION
" Special methods
syn keyword ngsPredefinedVariable init call args
syn keyword ngsKeyword super
" Namespaces
syn keyword ngsNamespace AWS CHARS Doc OS

" strings
syn match   ngsSpecial contained #\$#
syn region  ngsString start=+'+ end=+'+ skip=+\\\\\|\\'+ contains=ngsSpecial
syn region  ngsString start=+"+ end=+"+ skip=+\\\\\|\\"+ contains=ngsSpecial
"syn region  ngsString start=+/+ end=+/+ skip=+\\\\\|\\"+ contains=ngsSpecial

syn match   ngsNumber "\<\d\+\>"

" builtin functions
syn keyword ngsFunction c_access c_close c_closedir c_errno c_execve c_exit c_fork c_fstat c_lseek c_lstat copy c_open c_opendir c_stat c_pcre_compile c_pcre_exec c_read c_readdir c_waitpid C_WEXITSTATUS C_WTERMSIG compile defined del dump echo get globals hash method_not_found_handler in inherit is keys len load not decode_json pop push push_all shift typeof values
" bootstrap functions (only the ones that are relevant for later usage)
syn keyword ngsFunction bootstrap bootstrap_debug bootstrap_exception_catch_wrapper bootstrap_find_ngs_dir fetch main print_exception require ExitCode

" stdlib functions
syn keyword ngsFunction abs Argv access acquire all any assert basename cached chr close close_reading_end close_writing_end cmp code compare count
syn keyword ngsFunction dflt digest drop dup2 dup2_reading_end dup2_writing_end each each_idx_key_val each_idx_val ends_with error exit_hook
syn keyword ngsFunction debug die ensure_array filter filterk filterv finally find_in_path finished_ok first flatten fstat global_not_found_handler group has
syn keyword ngsFunction identity in index indexes inspect intersperse join kill len limit lines log lstat map mapo map_idx_key_val map_idx_val mapk mapv mapkv max merge_sorted min
syn keyword ngsFunction next none nop only open ord partial partial_tail partition peek pmap pos ptimes publish rand read reduce reject rejectk rejectv release replace reverse
syn keyword ngsFunction set sort sortk split srand starts_with stat status store StrParams Strs subscribe subset sum take tap test the_one uniq unshift update wait warn without write zip

syn keyword ngsFunction c_gettimeofday c_strftime c_strptime c_time gmtime localtime strftime time

syn keyword ngsFunction encode encode_hex encode_html encode_html_attr encode_json encode_uri_component
syn keyword ngsFunction decode decode_hex decode_uri_component

" resources types
syn keyword ngsType Res ResDef ResNotFound

syn keyword ngsType AwsRes AwsResDef
syn keyword ngsType AwsAncor

syn keyword ngsType AwsElb AwsElbRes
syn keyword ngsType AwsImage AwsImageRes
syn keyword ngsType AwsInstance AwsInstanceRes
syn keyword ngsType AwsRecordSet AwsRecordSetRes
syn keyword ngsType AwsSecGroup AwsSecGroupRes
syn keyword ngsType AwsVpc AwsVpcRes

" Res library functions
syn keyword ngsFunction converge create created delete expect find find_if_needed ids opt_prop req_prop validate

" AWS library functions
syn keyword ngsFunction latest users_ids

" test library functions
syn keyword ngsFunction log_test_ok
syn keyword ngsFunction assert_base assert_eq assert_type assert_hash assert_array assert_string assert_hash_keys assert_hash_keys_values assert_min_len assert_exit_code assert_output_has assert_has assert_resolvable assert_path_exists

hi def link ngsComment Comment
hi def link ngsConditional Conditional
hi def link ngsConstant Constant
hi def link ngsFunction Function
hi def link ngsKeyword Keyword
hi def link ngsNumber Number
hi def link ngsOperator Operator
hi def link ngsPredefinedVariable Identifier
hi def link ngsRepeat Repeat
hi def link ngsSpecial Special
hi def link ngsString String
hi def link ngsTest PreProc
hi def link ngsTodo Todo
hi def link ngsType Type
hi def link ngsNamespace Keyword

let b:current_syntax = "ngs"

" vim: nowrap sw=4 sts=4 ts=4 et:

