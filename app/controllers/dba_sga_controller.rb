# encoding: utf-8
class DbaSgaController < ApplicationController

  #require "dba_helper"   # Erweiterung der Controller um Helper-Methoden
  include DbaHelper
  
  # Auflösung/Detaillierung der im Feld MODUL geührten Innformation
  def show_application_info
    info =explain_application_info(params[:org_text])
    if info[:short_info]
      explain_text = "#{info[:short_info]}<BR>#{info[:long_info]}"
    else
      explain_text = "nothing known for #{params[:org_text]}"        # Default
    end

    respond_to do |format|
      format.js {render :js => "$('##{params[:update_area]}').html('#{j explain_text }');"}
    end
  end

  def list_sql_area_sql_id  # Auswertung GV$SQLArea
    @modus = "GV$SQLArea"
    list_sql_area(@modus)
  end

  def list_sql_area_sql_id_childno # Auswertung GV$SQL
    @modus = "GV$SQL"
    list_sql_area(@modus)
  end

  private
  def list_sql_area(modus)
    @instance = prepare_param_instance
    @sql_id = params[:sql_id]  =="" ? nil : params[:sql_id].strip
    @filter = params[:filter]  =="" ? nil : params[:filter]
    @sqls = fill_sql_area_list(modus, @instance,
                          @filter,
                          @sql_id,
                          params[:maxResultCount],
                          params[:topSort]
    )
    respond_to do |format|
      format.js {render :js => "$('##{params[:update_area]}').html('#{j render_to_string :partial=>"list_sql_area" }');"}
    end
  end

  def fill_sql_area_list(modus, instance, filter, sql_id, max_result_count, top_sort) # Wird angesprungen aus Vor-Methode
    where_string = ""
    where_values = []

    if instance
      where_string << " AND s.Inst_ID = ?"
      where_values << instance
    end
    if filter
      where_string << " AND UPPER(SQL_FullText) LIKE UPPER('%'||?||'%')"
      where_values << filter
    end
    if sql_id
      where_string << " AND s.SQL_ID = ?"
      where_values << sql_id
    end

    where_values << max_result_count

    sql_select_all ["\
      SELECT /* Panorama-Tool Ramm */ *
      FROM (SELECT  SUBSTR(LTRIM(SQL_TEXT),1,40) SQL_Text,
                s.SQL_Text Full_SQL_Text,
                s.Inst_ID, s.Parsing_Schema_Name,
                u.USERNAME,
                s.ELAPSED_TIME/1000000 ELAPSED_TIME_SECS,
                (s.ELAPSED_TIME / 1000000) / DECODE(s.EXECUTIONS, 0, 1, s.EXECUTIONS) ELAPSED_TIME_SECS_PER_EXECUTE,
                s.DISK_READS,
                s.DISK_READS / DECODE(s.EXECUTIONS, 0, 1, s.EXECUTIONS) DISK_READS_PER_EXECUTE,
                s.BUFFER_GETS,
                (s.BUFFER_GETS / DECODE(s.EXECUTIONS, 0, 1, s.EXECUTIONS)) BUFFER_GETS_PER_EXEC,
                s.EXECUTIONS,
                s.PARSE_CALLS, s.SORTS, s.LOADS,
                s.ROWS_PROCESSED,
                s.Rows_Processed / DECODE(s.EXECUTIONS, 0, 1, s.EXECUTIONS) Rows_Processed_PER_EXECUTE,
                100 * (s.Buffer_Gets - s.Disk_Reads) / GREATEST(s.Buffer_Gets, 1) Hit_Ratio,
                s.FIRST_LOAD_TIME, s.SHARABLE_MEM, s.PERSISTENT_MEM, s.RUNTIME_MEM,
                ROUND(s.CPU_TIME / 1000000, 3) CPU_TIME_SECS,
                ROUND(s.Cluster_Wait_Time / 1000000, 3) Cluster_Wait_Time_SECS,
                ROUND((s.CPU_TIME / 1000000) / DECODE(s.EXECUTIONS, 0, 1, s.EXECUTIONS), 3) AS CPU_TIME_SECS_PER_EXECUTE,
                s.SQL_ID, s.Plan_Hash_Value, s.Object_Status, s.Last_Active_Time
                #{modus=="GV$SQL" ? ", s.Child_Number" : ", c.Child_Count, c.Child_Number" }
           FROM #{modus} s
           JOIN ALL_USERS u ON u.User_ID = s.Parsing_User_ID
           #{modus=="GV$SQL" ? "" :
          " JOIN (SELECT /*+ NO_MERGE */ Inst_ID, SQL_ID, COUNT(*) Child_Count, MIN(Child_Number) Child_Number
                  FROM   GV$SQL GROUP BY Inst_ID, SQL_ID
                 ) c ON c.Inst_ID=s.Inst_ID AND c.SQL_ID=s.SQL_ID"
           }
          WHERE 1 = 1 -- damit nachfolgende Klauseln mit AND beginnen können
            #{where_string}
            "+
          case top_sort
            when "BufferGetsPerRow"     then " AND Rows_Processed>0"
          else
            ""
          end + "
          ORDER BY "+ 
            case top_sort
              when "ElapsedTimePerExecute"then "s.ELAPSED_TIME/DECODE(s.EXECUTIONS, 0, 1, s.EXECUTIONS) DESC"
              when "ElapsedTimeTotal"     then "s.ELAPSED_TIME DESC"
              when "ExecutionCount"       then "s.Executions DESC"
              when "RowsProcessed"        then "s.Rows_Processed DESC"
              when "ExecsPerDisk"         then "s.Executions/DECODE(s.Disk_Reads,0,1,s.Disk_Reads) DESC"
              when "BufferGetsPerRow"     then "s.Buffer_Gets/DECODE(s.Rows_Processed,0,1,s.Rows_Processed) DESC"
              when "CPUTime"              then "s.CPU_Time DESC"
              when "BufferGets"           then "s.Buffer_gets DESC"
              when "ClusterWaits"         then "s.Cluster_Wait_Time DESC"
              when "LastActive"           then "s.Last_Active_Time DESC"
            end + " )  \n\
  WHERE ROWNUM < ?
  ORDER BY "+
        case top_sort
          when "ElapsedTimePerExecute"then "ELAPSED_TIME_SECS_PER_EXECUTE DESC"
          when "ElapsedTimeTotal"     then "ELAPSED_TIME_SECS DESC"
          when "ExecutionCount"       then "Executions DESC"
          when "RowsProcessed"        then "Rows_Processed DESC"
          when "ExecsPerDisk"         then "Executions/DECODE(Disk_Reads,0,1,Disk_Reads) DESC"
          when "BufferGetsPerRow"     then "Buffer_Gets/DECODE(Rows_Processed,0,1,Rows_Processed) DESC"
          when "CPUTime"              then "CPU_Time_Secs DESC"
          when "BufferGets"           then "Buffer_gets DESC"
          when "ClusterWaits"         then "Cluster_Wait_Time_Secs DESC"
          when "LastActive"           then "Last_Active_Time DESC"
        end
    ].concat(where_values)
  end

  private
  # Modus enthält GV$SQL oder GV$SQLArea
  def fill_sql_sga_stat(modus, instance, sql_id, object_status, child_number=nil )
    filter = [instance, sql_id, object_status]
    filter << child_number if modus == "GV$SQL"
    sql = sql_select_first_row ["\
      SELECT /* Panorama-Tool Ramm */
                s.ELAPSED_TIME/1000000 ELAPSED_TIME_SECS,
                s.Inst_ID, s.Object_Status,
                s.DISK_READS,
                s.BUFFER_GETS,
                s.EXECUTIONS, Fetches,
                s.PARSE_CALLS, s.SORTS, s.LOADS, s.ROWS_PROCESSED,
                100 * (s.Buffer_Gets - s.Disk_Reads) / GREATEST(s.Buffer_Gets, 1) Hit_Ratio,
                s.FIRST_LOAD_TIME, s.Last_Load_Time, s.SHARABLE_MEM, s.PERSISTENT_MEM, s.RUNTIME_MEM,
                s.Last_Active_Time,
                s.CPU_TIME/1000000 CPU_TIME_SECS,
                s.Application_Wait_Time/1000000 Application_Wait_Time_secs,
                s.Concurrency_Wait_Time/1000000 Concurrency_Wait_Time_secs,
                s.Cluster_Wait_Time/1000000     Cluster_Wait_Time_secs,
                s.User_IO_Wait_Time/1000000     User_IO_Wait_Time_secs,
                s.PLSQL_Exec_Time/1000000       PLSQL_Exec_Time_secs,
                s.SQL_ID,
                #{modus=="GV$SQL" ? "Child_Number," : "" }
                (SELECT COUNT(*) FROM GV$SQL c WHERE c.Inst_ID = s.Inst_ID AND c.SQL_ID = s.SQL_ID) Child_Count,
                s.Plan_Hash_Value, s.Optimizer_Env_Hash_Value, s.Module, s.Action, s.Inst_ID,
                s.Parsing_Schema_Name,
                o.Owner||'.'||o.Object_Name Program_Name, o.Object_Type Program_Type, o.Last_DDL_Time Program_Last_DDL_Time,
                s.Program_Line# Program_LineNo
           FROM #{modus} s
           LEFT OUTER JOIN DBA_Objects o ON o.Object_ID = s.Program_ID -- PL/SQL-Programm
           WHERE s.Inst_ID = ?
           AND   s.SQL_ID  = ?
           AND   s.Object_Status = ?
           #{modus=="GV$SQL" ? " AND s.Child_Number = ?" : "" }
           "].concat filter
    unless sql
      # Suchen nach anderem Object_Status wenn gesuchter nicht existent
      object_status = sql_select_one ["SELECT /* Panorama-Tool Ramm */ Object_Status
                                       FROM   #{modus} s
                                       WHERE  s.Inst_ID = ?
                                       AND    s.SQL_ID  = ?
                                       #{modus=="GV$SQL" ? " AND s.Child_Number = ?" : "" }
                                      "].concat(modus=="GV$SQL" ? [instance, sql_id, child_number] : [instance, sql_id])
      sql = fill_sql_sga_stat(modus, instance, sql_id, object_status, child_number) if object_status
    end
    sql
  end

  private
  def get_open_cursor_count(instance, sql_id)
    sql_select_one ["\
        SELECT /* Panorama-Tool Ramm */ COUNT(*)
        FROM   gv$Open_Cursor o
        WHERE  o.Inst_ID = ?
        AND    o.SQL_ID  = ?",
        instance, sql_id]
  end

  public
  # Anzeige Einzeldetails des SQL
  def list_sql_detail_sql_id_childno
    @modus = "GV$SQL"   # Detaillierung SQL-ID, ChildNo
    @instance     = prepare_param_instance
    @sql_id       = params[:sql_id]
    @child_number = params[:child_number].to_i
    @object_status= params[:object_status]
    @object_status='VALID' unless @object_status  # wenn kein status als Parameter uebergeben, dann VALID voraussetzen

    @sql = fill_sql_sga_stat("GV$SQL", @instance, @sql_id, @object_status, @child_number)
    @sql_statement = get_sga_sql_statement(@instance, @sql_id)
    # Separater Zugriff auf V$SQL_Plan, da nur dort die Spalte Optimizer gefüllt ist
    @plan0 = sql_select_all ["\
        SELECT /* Panorama-Tool Ramm */ Optimizer
        FROM  gV$SQL_Plan
        WHERE SQL_ID  = ?
        AND   Inst_ID = ?
        AND   Child_Number = ?
        AND   ID=0",
        @sql_id, @instance, @child_number
        ]

    @plans = sql_select_all ["\
        SELECT /* Panorama-Tool Ramm */
          Operation, Options, Object_Owner, Object_Name, Object_Type, Optimizer,
          DECODE(Other_Tag,
                 'PARALLEL_COMBINED_WITH_PARENT', 'PCWP',
                 'PARALLEL_COMBINED_WITH_CHILD' , 'PCWC',
                 'PARALLEL_FROM_SERIAL',          'S > P',
                 'PARALLEL_TO_PARALLEL',          'P > P',
                 'PARALLEL_TO_SERIAL',            'P > S',
                 Other_Tag
                ) Parallel_Short,
          Other_Tag Parallel,
          Depth, Access_Predicates, Filter_Predicates, temp_Space, Distribution,
          ID, Parent_ID, Executions,
          Last_Starts, Starts, Last_Output_Rows, Output_Rows, Last_CR_Buffer_Gets, CR_Buffer_Gets,
          Last_CU_Buffer_Gets, CU_Buffer_Gets, Last_Disk_Reads, Disk_Reads, Last_Disk_Writes, Disk_Writes,
          Last_Elapsed_Time/1000 Last_Elapsed_Time, Elapsed_Time/1000 Elapsed_Time,
          p.Cost, p.Cardinality, p.Bytes, p.Partition_Start, p.Partition_Stop, p.Partition_ID, p.Time,
          CASE WHEN p.Object_Type LIKE 'TABLE%' THEN (SELECT Num_Rows FROM All_Tables  t WHERE t.Owner=p.Object_Owner AND t.Table_Name=p.Object_Name)
                WHEN p.Object_Type LIKE 'INDEX%' THEN (SELECT Num_Rows FROM All_Indexes i WHERE i.Owner=p.Object_Owner AND i.Index_Name=p.Object_Name)
          ELSE NULL END Num_Rows,
          (SELECT SUM(Bytes)/(1024*1024) FROM DBA_Segments s WHERE s.Owner=p.Object_Owner AND s.Segment_Name=p.Object_Name) MBytes
          #{", a.DB_Time_Seconds, a.CPU_Seconds, a.Waiting_Seconds, a.Read_IO_Requests, a.Write_IO_Requests,
               a.IO_Requests, a.Read_IO_Bytes, a.Write_IO_Bytes, a.Interconnect_IO_Bytes, a.Min_Sample_Time  " if session[:database].version >= "11.2"}
        FROM  gV$SQL_Plan_Statistics_All p
        #{" LEFT OUTER JOIN (SELECT SQL_PLan_Line_ID, SQL_Plan_Hash_Value,
                                    COUNT(*)                                                   DB_Time_Seconds,
                                    SUM(CASE WHEN Session_State = 'ON CPU'  THEN 1 ELSE 0 END) CPU_Seconds,
                                    SUM(CASE WHEN Session_State = 'WAITING' THEN 1 ELSE 0 END) Waiting_Seconds,
                                    SUM(Delta_Read_IO_Requests)       Read_IO_Requests,
                                    SUM(Delta_Write_IO_Requests)      Write_IO_Requests,
                                    SUM(NVL(Delta_Read_IO_Requests,0)+NVL(Delta_Write_IO_Requests,0)) IO_Requests,
                                    SUM(Delta_Read_IO_Bytes)          Read_IO_Bytes,
                                    SUM(Delta_Write_IO_Bytes)         Write_IO_Bytes,
                                    SUM(Delta_Interconnect_IO_Bytes)  Interconnect_IO_Bytes,
                                    MIN(Sample_Time)                  Min_Sample_Time
                             FROM   gv$Active_Session_History
                             WHERE  SQL_ID  = ?
                             AND    Inst_ID = ?
                             AND    SQL_Child_Number = ?
                             GROUP BY SQL_Plan_Line_ID, SQL_Plan_Hash_Value
                 ) a ON a.SQL_Plan_Line_ID = p.ID AND a.SQL_Plan_Hash_Value = p.Plan_Hash_Value
          " if session[:database].version >= "11.2"}
        WHERE SQL_ID  = ?
        AND   Inst_ID = ?
        AND   Child_Number = ?
        ORDER BY ID",
        @sql_id, @instance, @child_number
        ].concat(session[:database].version >= "11.2" ? [@sql_id, @instance, @child_number] : [])

    # Vergabe der exec-Order im Explain
    # iteratives neu durchsuchen der Liste nach folgenden erfuellten Kriterien
    # - ID tritt nicht als Parent auf
    # - alle Children als Parent sind bereits mit ExecOrder versehen
    # gefundene Records werden mit aufteigender Folge versehen und im folgenden nicht mehr betrachtet

    # Array mit den Positionen der Objekte in @plans anlegen
    pos_array = []
    0.upto(@plans.length-1) {|i|  pos_array << i } 

    curr_execorder = 1                                             # Startwert
    while pos_array.length > 0                                     # Bis alle Records im PosArray mit Folge versehen sind
      pos_array.each {|i|                                          # Iteration ueber Verbliebene Records
        is_parent = false                                          # Default-Annahme, wenn kein Child gefunden
        pos_array.each {|x|                                        # Suchen, ob noch ein Child zum Parent existiert in verbliebener Menge
          if @plans[i].id == @plans[x].parent_id                   # Doch noch ein Child zum Parent gefunden
            is_parent = true
            break                                                  # Braucht nicht weiter gesucht werden
          end
        }
        unless is_parent
          @plans[i].execorder = curr_execorder                     # Vergabe Folge
          curr_execorder = curr_execorder + 1
          pos_array.delete(i)                                      # entwerten der verarbeiten Zeile fuer Folgebetrachtung
          break                                                    # Neue Suche vom Beginn an
        end
      }
    end
    
    # PGA-Workarea-Nutzung
    @workareas = sql_select_all ["\
      SELECT /* Panorama Ramm */ w.*,
             s.Serial# SerialNo,
             sq.Serial# QCSerialNo
      FROM   gv$SQL_Workarea_Active w
      JOIN   gv$Session s ON s.Inst_ID=w.Inst_ID AND s.SID=w.SID
      LEFT OUTER JOIN gv$Session sq ON sq.Inst_ID=w.QCInst_ID AND sq.SID=w.QCSID
      WHERE  w.SQL_ID = ?
      ORDER BY w.QCSID, w.SID
      ",  @sql_id]

    # Bindevariablen des Cursors
    @binds = sql_select_all ["\
      SELECT /* Panorama-Tool Ramm */ Name, Position, DataType_String, Last_Captured, Value_String, Child_Number
      FROM   gv$SQL_Bind_Capture c
      WHERE  Inst_ID = ?
      AND    SQL_ID  = ?
      AND    Child_Number = ?
      ORDER BY Position
      ", @instance, @sql_id, @child_number ]

    @open_cursors = get_open_cursor_count(@instance, @sql_id)

    respond_to do |format|
      format.js { if @sql
                    render :js => "$('##{params[:update_area]}').html('#{j render_to_string :partial=>"list_sql_detail_sql_id_childno" }');"
                  else
                    render :js => "$('##{params[:update_area]}').html('');
                                   alert('#{j "Kein Treffer in GV$SQL gefunden für SQL_ID='#{@sql_id}', Instance=#{@instance}, Child_Number=#{@child_number}"}');
                                   "
                  end
                }
    end
  end

  # Details auf Ebene SQL_ID kumuliert über Child-Cursoren
  def list_sql_detail_sql_id
    @instance = prepare_param_instance
    @sql_id   = params[:sql_id]
    @object_status= params[:object_status]
    @object_status='VALID' unless @object_status  # wenn kein status als Parameter uebergeben, dann VALID voraussetzen

    # Liste der Child-Cursoren
    @sqls = fill_sql_area_list("GV$SQL", @instance, nil, @sql_id, 100, "ElapsedTimeTotal")
    if @sqls.count == 1     # Nur einen Child-Cursor gefunden, dann direkt weiterleiten an Anzeige auf Child-Ebene
      @list_sql_sga_stat_msg = "Nur ein Child-Record gefunden in gv$SQL, daher gleich direkte Anzeige auf Child-Ebene"
      params[:child_number] = @sqls[0].child_number
      list_sql_detail_sql_id_childno  # Anzeige der Child-Info
    else
      @sql = fill_sql_sga_stat("GV$SQLArea", @instance, params[:sql_id], @object_status)
      @sql_statement = get_sga_sql_statement(@instance, params[:sql_id])
      @open_cursors = get_open_cursor_count(@instance, @sql_id)

      raise "SQL-ID '#{@sql_id}' not found in GV$SQL for instance #{@instance} !"  if @sqls.count == 0
      respond_to do |format|
         format.js { render :js => "$('##{params[:update_area]}').html('#{j render_to_string :partial=>"list_sql_detail_sql_id" }');" }
      end
    end
   end

  def list_sql_shared_cursor
    @instance     = params[:instance]
    @sql_id       = params[:sql_id]

    # Dyn. Erstellen SQL aus Spalten-Info des Views gv$SQL_Shared_Cursor, um nicht alle Spalten kennen zu müssen

    @reasons = sql_select_all ["\
      SELECT /* Panorama-Tool Ramm */ * FROM gv$SQL_Shared_Cursor WHERE Inst_ID=? AND SQL_ID=?",
      @instance, @sql_id, @child_number]

    @reasons.each do |r|
      reasons = ""        # Konkatenierte Strings mit Gründen
      r.each do |key, value|
        if key!="inst_id" && key!="sql_id" && key!="address" && key!="child_address" && key!="child_number" && key!="reason"
          reasons << "#{key}, "if value == 'Y'
        end
      end
      r["reasons"] = reasons   # Spalte im Result hinzufügen
    end

    respond_to do |format|
      format.js {render :js => "$('##{params[:update_area]}').html('#{j render_to_string :partial=>"list_sql_shared_cursor" }');"}
    end
  end

  # Anzeige der offenen Cursor eines SQL
  def list_open_cursor_per_sql
    @instance     = prepare_param_instance
    @sql_id       = params[:sql_id]

    @open_cursors = sql_select_all ["\
       SELECT /* Panorama-Tool Ramm */
              s.SID,
              s.Inst_ID,
              s.Serial# SerialNo,
              s.UserName,
              s.OSUser,
              s.Process,
              s.Machine,
              s.Program,
              s.Module,
              DECODE(o.SQL_ID, s.SQL_ID, 'Y', 'N') Stmt_Active
       FROM   gv$Open_Cursor o,
              gv$Session s
       WHERE  s.Inst_ID = o.Inst_ID
       AND    s.SAddr   = o.SAddr
       AND    s.SID     = o.SID
       AND    o.Inst_ID = ?
       AND    o.SQL_ID  = ?
       ", @instance, @sql_id]

    respond_to do |format|
      format.js {render :js => "$('##{params[:update_area]}').html('#{j render_to_string :partial=>"list_open_cursor_per_sql" }');"}
    end
  end

  # SGA-Komponenten 
  def list_sga_components
    @instance        = prepare_param_instance
    @sums = sql_select_all ["\
      SELECT /* Panorama-Tool Ramm */
             Inst_ID, NVL(Pool, Name) Pool, sum(Bytes) Bytes
      FROM   gv$sgastat
      #{@instance ? "WHERE  Inst_ID = ?" : ""}
      GROUP BY Inst_ID, NVL(Pool, Name)
      ORDER BY 2 DESC", @instance]
    @components = sql_select_all ["\
      SELECT /* Panorama-Tool Ramm */
        Inst_ID,
        Pool,                                                   
        Name,                                                   
        Bytes
      FROM GV$SGAStat
      #{@instance ? "WHERE  Inst_ID = ?" : ""}
      ORDER BY 1 DESC", @instance]
    respond_to do |format|
      format.js {render :js => "$('##{params[:update_area]}').html('#{j render_to_string :partial=>"dba_sga/list_sga_components" }');"}
    end
  end

  def list_db_cache_content
    @instance        = prepare_param_instance
    raise "Instance muss belegt sein" unless @instance
    @show_partitions = params[:show_partitions]
    @sysdate = (sql_select_all "SELECT SYSDATE FROM DUAL")[0].sysdate
    @db_cache_global_sums = sql_select_all ["
      SELECT /* Panorama-Tool Ramm */
        Status, Count(*) Blocks  
        FROM GV$BH
        WHERE Inst_ID=?
        GROUP BY Status                    
      ", @instance];
      
    # Konkrete Objekte im Cache  
    @objects = sql_select_all ["
      SELECT /*+ RULE */ /* Panorama-Tool Ramm */
        NVL(o.Owner,'[UNKNOWN]') Owner,                       
        NVL(o.Object_Name,'TS='||ts.Name) Object_Name,
        #{@show_partitions=="1" ? "o.SubObject_Name" : "''"} SubObject_Name,
        MIN(o.Object_Type) Object_Type,  -- MIN statt Aufnahme in GROUP BY
        MIN(CASE WHEN o.Object_Type LIKE 'INDEX%' THEN
                  (SELECT Table_Name FROM ALL_Indexes i WHERE i.Owner = o.Owner AND i.Index_Name = o.Object_Name)
        ELSE NULL END) Table_Name, -- MIN statt Aufnahme in GROUP BY
        SUM(bh.Blocks)      Blocks,
        SUM(bh.DirtyBlocks) DirtyBlocks,
        SUM(bh.TempBlocks)  TempBlocks,
        SUM(bh.Ping)        Ping,
        SUM(bh.Stale)       Stale,
        SUM(bh.Direct)      Direct,
        SUM(Forced_Reads)   Forced_Reads,
        SUM(Forced_Writes)  Forced_Writes,
        SUM(Status_cr)      Status_cr,
        SUM(Status_pi)      Status_pi,
        SUM(Status_read)    Status_read,
        SUM(Status_scur)    Status_scur,
        SUM(Status_xcur)    Status_xcur
      FROM                                                    
        (SELECT /*+ NO_MERGE */
                ObjD, TS#,
                Count(*) Blocks,
                SUM(DECODE(Dirty,'Y',1,0))  DirtyBlocks,
                SUM(DECODE(Temp,'Y',1,0))   TempBlocks,
                SUM(DECODE(Ping,'Y',1,0))   Ping,
                SUM(DECODE(Stale,'Y',1,0))  Stale,
                SUM(DECODE(Direct,'Y',1,0)) Direct,
                SUM(Forced_Reads)           Forced_Reads,
                SUM(Forced_Writes)          Forced_Writes,
                SUM(DECODE(Status, 'cr', 1, 0))    Status_cr,
                SUM(DECODE(Status, 'pi', 1, 0))    Status_pi,
                SUM(DECODE(Status, 'read', 1, 0))    Status_read,
                SUM(DECODE(Status, 'scur', 1, 0))    Status_scur,
                SUM(DECODE(Status, 'xcur', 1, 0))    Status_xcur
        FROM GV$BH                                            
        WHERE Status != 'free'  /* dont show blocks of truncated tables */
        AND   Inst_ID = ?
        GROUP BY ObjD, TS#
        ) BH
        LEFT OUTER JOIN DBA_Objects o ON o.Data_Object_ID = bh.ObjD
        LEFT OUTER JOIN sys.TS$ ts ON ts.TS# = bh.TS#
      GROUP BY NVL(o.Owner,'[UNKNOWN]'), NVL(o.Object_Name,'TS='||ts.Name)#{@show_partitions=="1" ? ", o.SubObject_Name" : ""}
      ORDER BY 6 DESC", @instance];
    @total_blocks = 0                  # Summation der Blockanzahl des Caches
    @objects.each do |o|
      @total_blocks += o.blocks
    end
    respond_to do |format|
      format.js {render :js => "$('#list_db_cache_content_area').html('#{j render_to_string :partial=>"list_db_cache_content" }');"}
    end
  end # list_db_cache_content

  def show_using_sqls
    object_owner = params[:ObjectOwner]
    object_owner = nil if object_owner == ""
    @instance = prepare_param_instance

    wherestr = "p.Object_Name LIKE UPPER(?)"
    whereval = [params[:ObjectName]]

    if object_owner
      wherestr << " AND p.Object_Owner=UPPER(?)"
      whereval << object_owner
    end

    if @instance
      wherestr << " AND p.Inst_ID=?"
      whereval << @instance
    end

    @sqls = sql_select_all ["
       SELECT s.Inst_ID, SUBSTR(s.SQL_TEXT,1,100) SQL_Text,     
              s.Executions, s.Fetches, s.First_load_time,       
              s.Parsing_Schema_Name,
              s.Rows_Processed, s.last_load_time,               
              s.ELAPSED_TIME/1000000 ELAPSED_TIME_SECS,
              (s.ELAPSED_TIME/1000000) / DECODE(s.EXECUTIONS, 0, 1, s.EXECUTIONS) ELAPSED_TIME_SECS_PER_EXECUTE,
              ROUND(s.CPU_TIME / 1000000, 3) CPU_TIME_SECS,
              s.DISK_READS,
              s.DISK_READS / DECODE(s.EXECUTIONS, 0, 1, s.EXECUTIONS) DISK_READS_PER_EXECUTE,
              s.BUFFER_GETS,
              s.BUFFER_GETS / DECODE(s.EXECUTIONS, 0, 1, s.EXECUTIONS) BUFFER_GETS_PER_EXEC,
              s.ROWS_PROCESSED,
              s.Rows_Processed / DECODE(s.EXECUTIONS, 0, 1, s.EXECUTIONS) Rows_Processed_PER_EXECUTE,
              s.SQL_ID, s.Child_Number,
              p.operation, p.options, p.access_predicates
       FROM gV$SQL_Plan p
       JOIN gv$SQL s     ON (    s.SQL_ID          = p.SQL_ID
                             AND s.Plan_Hash_Value = p.Plan_Hash_Value
                             AND s.Inst_ID         = p.Inst_ID
                             AND s.Child_Number    = p.Child_Number
                            )
       WHERE #{wherestr}
       ORDER BY s.Elapsed_Time DESC"].concat whereval;
    respond_to do |format|
      format.js {render :js => "$('##{params[:update_area]}').html('#{j render_to_string :partial=>"show_using_sqls" }');"}
    end
  end

  def list_object_nach_file_und_block
     @object = object_nach_file_und_block(params[:fileno], params[:blockno]) 
     #@object = "[Kein Object gefunden für Parameter FileNo=#{params[:fileno]}, BlockNo=#{params[:blockno]}]" unless @object
     respond_to do |format|
       format.js {render :js => "$('#list_object_area').html('#{j render_to_string :partial=>"list_object_nach_file_und_block" }');"}
     end
  end

  def list_cursor_memory
    @instance =  prepare_param_instance
    @sid      =  params[:sid].to_i
    @serialno = params[:serialno].to_i
    @sql_id   = params[:sql_id]

        @workareas = sql_select_all ["
      SELECT /*+ ORDERED USE_HASH(s wa) */
             *
      FROM   gv$SQL_Workarea wa
      WHERE  wa.Inst_ID=? AND wa.SQL_ID=?
      ", @instance, @sql_id]

    respond_to do |format|
      format.js {render :js => "$('##{params[:update_area]}').html('#{j render_to_string :partial=>"list_cursor_memory" }');"}
    end
  end


  def list_compare_execution_plans
    @instance_1 = params[:instance_1].to_i
    @instance_2 = params[:instance_2].to_i
    @sql_id_1 = params[:sql_id_1]
    @sql_id_2 = params[:sql_id_2]
    @child_number_1 = params[:child_number_1].to_i
    @child_number_2 = params[:child_number_2].to_i

    @plan_count = sql_select_one ["\
            SELECT /* Panorama-Tool Ramm */ COUNT(DISTINCT Plan_Hash_Value)
            FROM  gV$SQL_Plan p
            WHERE (    Inst_ID      = ?
                   AND SQL_ID       = ?
                   AND Child_Number = ?
                  )
            OR    (    Inst_ID      = ?
                   AND SQL_ID       = ?
                   AND Child_Number = ?
                  )
            ",
            @instance_1, @sql_id_1, @child_number_1, @instance_2, @sql_id_2, @child_number_2
            ]

    plans = sql_select_all ["\
        SELECT /* Panorama-Tool Ramm */
          Inst_ID, SQL_ID, Child_Number,
          Operation, Options, Object_Owner, Object_Name, Object_Type, Optimizer,
          DECODE(Other_Tag,
                 'PARALLEL_COMBINED_WITH_PARENT', 'PCWP',
                 'PARALLEL_COMBINED_WITH_CHILD' , 'PCWC',
                 'PARALLEL_FROM_SERIAL',          'S > P',
                 'PARALLEL_TO_PARALLEL',          'P > P',
                 'PARALLEL_TO_SERIAL',            'P > S',
                 Other_Tag
                ) Parallel_Short,
          Other_Tag Parallel,
          Depth, Access_Predicates, Filter_Predicates, temp_Space, Distribution,
          ID, Parent_ID,
          Count(*) OVER (PARTITION BY p.Parent_ID, p.Operation, p.Options, p.Object_Owner,    -- p.ID nicht abgleichen, damit Verschiebungen im Plan toleriert werden
                        CASE WHEN p.Object_Name LIKE ':TQ%'
                          THEN 'Hugo'
                          ELSE p.Object_Name END,
                        p.Other_Tag, p.Depth,
                        p.Access_Predicates, p.Filter_Predicates, p.Distribution
          ) Version_Orange_Count,
          Count(*) OVER (PARTITION BY p.Parent_ID, p.Operation, p.Options, p.Object_Owner,     -- p.ID nicht abgleichen, damit Verschiebungen im Plan toleriert werden
                        CASE WHEN p.Object_Name LIKE ':TQ%'
                          THEN 'Hugo'
                          ELSE p.Object_Name END,
                       p.Depth
          ) Version_Red_Count
        FROM  gV$SQL_Plan p
        WHERE (    Inst_ID      = ?
               AND SQL_ID       = ?
               AND Child_Number = ?
              )
        OR    (    Inst_ID      = ?
               AND SQL_ID       = ?
               AND Child_Number = ?
              )
        ORDER BY ID",
        @instance_1, @sql_id_1, @child_number_1, @instance_2, @sql_id_2, @child_number_2
        ]

    @plan_1, @plan_2 = [], []
    plans.each do |p|
      @plan_1 << p if p.inst_id == @instance_1 && p.sql_id == @sql_id_1 && p.child_number == @child_number_1
      @plan_2 << p if p.inst_id == @instance_2 && p.sql_id == @sql_id_2 && p.child_number == @child_number_2
    end

    respond_to do |format|
      format.js {render :js => "$('##{params[:update_area]}').html('#{j render_to_string :partial=>"list_compare_execution_plans" }');"}
    end
  end

  # Result Cache
  def list_result_cache
    @instance        = prepare_param_instance

    @sums = sql_select_all ["\
          SELECT /* Panorama-Tool Ramm */
                 s.Inst_ID, s.Space_Bytes, ms.Value Max_Size
          FROM   (SELECT
                         o.Inst_ID, SUM(Space_Overhead) + SUM(Space_Unused) Space_Bytes
                  FROM   gv$Result_Cache_Objects o
                  WHERE  Type = 'Result'
                  #{@instance ? " AND Inst_ID = ?" : ""}
                  GROUP BY Inst_ID
                 ) s
          JOIN   gv$Parameter ms ON ms.Inst_ID = s.Inst_ID AND ms.Name = 'result_cache_max_size'
          ", @instance]

    @usage = sql_select_all ["\
      SELECT /* Panorama-Tool Ramm */
             o.*,
             (SELECT UserName FROM All_Users WHERE User_ID = o.Min_User_ID) Min_Creator,
             (SELECT UserName FROM All_Users WHERE User_ID = o.Max_User_ID) Max_Creator
      FROM   (SELECT
                     o.Inst_ID, o.Status, o.Name, o.NameSpace,
                     SUM(Space_Overhead)/1024    Space_Overhead_KB,
                     SUM(Space_Unused)/1024      Space_Unused_KB,
                     MIN(Creation_Timestamp)     Min_CreationTS,
                     MAX(Creation_Timestamp)     Max_CreationTS,
                     MIN(Creator_UID) KEEP (DENSE_RANK FIRST ORDER BY Creation_Timestamp) Min_User_ID,
                     MAX(Creator_UID) KEEP (DENSE_RANK LAST  ORDER BY Creation_Timestamp) Max_User_ID,
                     MAX(Depend_Count) Depend_Count,
                     SUM(Pin_Count)     Pin_Count,
                     SUM(Scan_Count)    Scan_Count,
                     SUM(Row_Count)     Row_Count,
                     MIN(Row_Size_Min)  Row_Size_Min,
                     MAX(Row_Size_Max)  Row_Size_Max,
                     SUM(Row_Size_Avg*Row_Count)/SUM(Row_Count)  Row_Size_Avg,
                     SUM(Invalidations) Invalidations
              FROM   gv$Result_Cache_Objects o
              WHERE  Type = 'Result'
              #{@instance ? " AND Inst_ID = ?" : ""}
              GROUP BY Inst_ID, Status, Name, NameSpace
            ) o
      ORDER BY Space_Overhead_KB+Space_Unused_KB DESC", @instance]

    respond_to do |format|
      format.js {render :js => "$('##{params[:update_area]}').html('#{j render_to_string :partial=>"list_result_cache" }');"}
    end
  end


end